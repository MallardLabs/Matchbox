import {
  CONTRACTS,
  THIRD_PARTY_VOTER_ABI,
  VOTING_ESCROW_ABI,
} from "@repo/shared/contracts"
import { type Address, type PublicClient, getAddress } from "viem"

import { MEZO_GAUGES } from "./constants"
import { epochIndexFor, epochStartFor } from "./epochs"
import { aggregateVotes, participationBps, shareBps } from "./participation"
import { type MezoGaugesSnapshot, mezoGaugesSnapshotSchema } from "./schema"
import { fetchActiveThirdPartyVotes, fetchVeMezoOwners } from "./subgraph"

export { mezoGaugesSnapshotSchema, type MezoGaugesSnapshot }

export async function buildParticipationSnapshot(options: {
  client: PublicClient
  blockNumber?: bigint | undefined
}): Promise<MezoGaugesSnapshot> {
  const { client } = options
  const voter = CONTRACTS.mainnet.thirdPartyVoter
  const veMezo = CONTRACTS.mainnet.veMEZO
  const block = await client.getBlock(
    options.blockNumber !== undefined
      ? { blockNumber: options.blockNumber }
      : { blockTag: "latest" },
  )
  const blockOpts = { blockNumber: block.number }

  const gaugeAddresses = Object.keys(MEZO_GAUGES) as Address[]

  const [totalWeight, totalVotingPower, supply, tokenId, gaugeReads, votes] =
    await Promise.all([
      client.readContract({
        address: voter,
        abi: THIRD_PARTY_VOTER_ABI,
        functionName: "totalWeight",
        ...blockOpts,
      }),
      client.readContract({
        address: veMezo,
        abi: VOTING_ESCROW_ABI,
        functionName: "totalVotingPower",
        ...blockOpts,
      }),
      client.readContract({
        address: veMezo,
        abi: VOTING_ESCROW_ABI,
        functionName: "supply",
        ...blockOpts,
      }),
      client.readContract({
        address: veMezo,
        abi: VOTING_ESCROW_ABI,
        functionName: "tokenId",
        ...blockOpts,
      }),
      Promise.all(
        gaugeAddresses.map(async (gauge) => {
          try {
            const [weight, isAlive] = await Promise.all([
              client.readContract({
                address: voter,
                abi: THIRD_PARTY_VOTER_ABI,
                functionName: "weights",
                args: [gauge],
                ...blockOpts,
              }),
              client.readContract({
                address: voter,
                abi: THIRD_PARTY_VOTER_ABI,
                functionName: "isAlive",
                args: [gauge],
                ...blockOpts,
              }),
            ])
            return { gauge, weight, isAlive, status: "ok" as const }
          } catch {
            return { gauge, status: "error" as const }
          }
        }),
      ),
      fetchActiveThirdPartyVotes({
        blockNumber: block.number,
      }),
    ])

  // The subgraph is the only source for per-wallet votes. If it goes stale
  // (e.g. vote handlers removed upstream) it can return zero rows while the
  // voter contract still holds weight — refuse rather than render an empty
  // dashboard that looks real.
  if (votes.length === 0 && totalWeight > 0n) {
    throw new Error(
      "Subgraph returned no active votes while on-chain totalWeight is nonzero",
    )
  }

  const votingTokenIds = [
    ...new Set(
      votes
        .filter((vote) => vote.currentWeight > 0n)
        .map((vote) => vote.tokenId.toString()),
    ),
  ]
  const owners = await fetchVeMezoOwners({
    tokenIds: votingTokenIds.map(BigInt),
    blockNumber: block.number,
  })
  // LockPosition is not complete for older NFTs in the deployed subgraph.
  // Resolve missing owners from the escrow at the same block instead of
  // falling back to Vote.owner, which records the vote actor.
  await Promise.all(
    votingTokenIds
      .filter((id) => !owners.has(id))
      .map(async (id) => {
        const owner = await client.readContract({
          address: veMezo,
          abi: VOTING_ESCROW_ABI,
          functionName: "ownerOf",
          args: [BigInt(id)],
          ...blockOpts,
        })
        owners.set(id, owner)
      }),
  )

  // Gauges that received votes but aren't in the registry (e.g. killed
  // community gauges) still hold weight; read them on-chain too.
  const unlistedGauges = [
    ...new Set(votes.map((v) => v.gauge.toLowerCase())),
  ].filter((gauge) => {
    const weight = votes
      .filter((v) => v.gauge.toLowerCase() === gauge)
      .reduce((sum, v) => sum + v.currentWeight, 0n)
    return weight > 0n && !gaugeAddresses.some((g) => g.toLowerCase() === gauge)
  })
  const unlistedReads = await Promise.all(
    unlistedGauges.map(async (gauge) => {
      const address = getAddress(gauge)
      try {
        const [weight, isAlive] = await Promise.all([
          client.readContract({
            address: voter,
            abi: THIRD_PARTY_VOTER_ABI,
            functionName: "weights",
            args: [address],
            ...blockOpts,
          }),
          client.readContract({
            address: voter,
            abi: THIRD_PARTY_VOTER_ABI,
            functionName: "isAlive",
            args: [address],
            ...blockOpts,
          }),
        ])
        return { gauge: address, weight, isAlive, status: "ok" as const }
      } catch {
        return { gauge: address, status: "error" as const }
      }
    }),
  )

  const aggregated = aggregateVotes(
    votes.map((v) => ({
      tokenId: v.tokenId,
      owner: owners.get(v.tokenId.toString()) ?? v.owner,
      gauge: v.gauge,
      currentWeight: v.currentWeight,
    })),
  )

  const reconciliationDiff = aggregated.totalWeight - totalWeight
  const topWallet = aggregated.byWallet[0]
  const blockTimestamp = Number(block.timestamp)

  return mezoGaugesSnapshotSchema.parse({
    blockNumber: block.number.toString(),
    blockTimestamp,
    epochStart: epochStartFor(blockTimestamp),
    epochIndex: epochIndexFor(epochStartFor(blockTimestamp)),
    totalWeight: totalWeight.toString(),
    totalVotingPower: totalVotingPower.toString(),
    supply: supply.toString(),
    tokenId: tokenId.toString(),
    participationBps: participationBps(
      totalWeight,
      totalVotingPower,
    ).toString(),
    votingNfts: aggregated.votingNfts,
    wallets: aggregated.wallets,
    topWallet: topWallet
      ? {
          owner: topWallet.owner,
          weight: topWallet.weight.toString(),
          shareBps: topWallet.shareBps.toString(),
        }
      : null,
    byWallet: aggregated.byWallet.map((w) => ({
      owner: w.owner,
      weight: w.weight.toString(),
      shareBps: w.shareBps.toString(),
      gauges: w.gauges,
    })),
    gauges: [
      ...gaugeReads.map((read) => ({
        address: read.gauge,
        name: MEZO_GAUGES[read.gauge]?.name ?? read.gauge,
        protocol: MEZO_GAUGES[read.gauge]?.protocol ?? "unknown",
        listed: true,
        status: read.status,
        isAlive: read.status === "ok" ? read.isAlive : null,
        weight: read.status === "ok" ? read.weight.toString() : null,
        shareBps:
          read.status === "ok"
            ? shareBps(read.weight, totalWeight).toString()
            : null,
      })),
      ...unlistedReads.map((read) => ({
        address: read.gauge,
        name: `${read.gauge.slice(0, 6)}…${read.gauge.slice(-4)} (unlisted)`,
        protocol: "unknown",
        listed: false,
        status: read.status,
        isAlive: read.status === "ok" ? read.isAlive : null,
        weight: read.status === "ok" ? read.weight.toString() : null,
        shareBps:
          read.status === "ok"
            ? shareBps(read.weight, totalWeight).toString()
            : null,
      })),
    ],
    subgraphTotalWeight: aggregated.totalWeight.toString(),
    reconciled: reconciliationDiff === 0n,
    reconciliationDiff: reconciliationDiff.toString(),
  })
}
