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
import { fetchActiveThirdPartyVotes } from "./subgraph"

export { mezoGaugesSnapshotSchema, type MezoGaugesSnapshot }

export async function buildParticipationSnapshot(options: {
  client: PublicClient
  blockNumber?: bigint | undefined
}): Promise<MezoGaugesSnapshot> {
  const { client } = options
  const voter = CONTRACTS.mainnet.thirdPartyVoter
  const veMezo = CONTRACTS.mainnet.veMEZO
  const blockNumber = options.blockNumber
  const blockOpts = blockNumber !== undefined ? { blockNumber } : {}

  const block = await client.getBlock(
    blockNumber !== undefined ? { blockNumber } : { blockTag: "latest" },
  )

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
          const [weight, isAlive] = await Promise.all([
            client
              .readContract({
                address: voter,
                abi: THIRD_PARTY_VOTER_ABI,
                functionName: "weights",
                args: [gauge],
                ...blockOpts,
              })
              .catch(() => 0n),
            client
              .readContract({
                address: voter,
                abi: THIRD_PARTY_VOTER_ABI,
                functionName: "isAlive",
                args: [gauge],
                ...blockOpts,
              })
              .catch(() => false),
          ])
          return { gauge, weight, isAlive }
        }),
      ),
      fetchActiveThirdPartyVotes({
        blockNumber: block.number,
      }),
    ])

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
      const [weight, isAlive] = await Promise.all([
        client
          .readContract({
            address: voter,
            abi: THIRD_PARTY_VOTER_ABI,
            functionName: "weights",
            args: [address],
            ...blockOpts,
          })
          .catch(() => 0n),
        client
          .readContract({
            address: voter,
            abi: THIRD_PARTY_VOTER_ABI,
            functionName: "isAlive",
            args: [address],
            ...blockOpts,
          })
          .catch(() => false),
      ])
      return { gauge: address, weight, isAlive }
    }),
  )

  const aggregated = aggregateVotes(
    votes.map((v) => ({
      tokenId: v.tokenId,
      owner: v.owner,
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
      ...gaugeReads.map(({ gauge, weight, isAlive }) => ({
        address: gauge,
        name: MEZO_GAUGES[gauge]?.name ?? gauge,
        protocol: MEZO_GAUGES[gauge]?.protocol ?? "unknown",
        listed: true,
        isAlive,
        weight: weight.toString(),
        shareBps: shareBps(weight, totalWeight).toString(),
      })),
      ...unlistedReads.map(({ gauge, weight, isAlive }) => ({
        address: gauge,
        name: "Unlisted gauge",
        protocol: "unknown",
        listed: false,
        isAlive,
        weight: weight.toString(),
        shareBps: shareBps(weight, totalWeight).toString(),
      })),
    ],
    subgraphTotalWeight: aggregated.totalWeight.toString(),
    reconciled: reconciliationDiff === 0n,
    reconciliationDiff: reconciliationDiff.toString(),
  })
}
