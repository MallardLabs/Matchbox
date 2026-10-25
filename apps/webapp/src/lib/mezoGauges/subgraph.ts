import { CHAIN_ID, CONTRACTS } from "@repo/shared/contracts"
import { z } from "zod"

import {
  EARN_LOCKS_MEZO_URL,
  EARN_PAGE_SIZE,
  EARN_VOTES_MEZO_URL,
  earnRows,
  fetchStakeOwners,
  queryEarnSubgraph,
  secondsToTimeseries,
  timeseriesToSeconds,
  tokenIdFromStakeId,
} from "@/lib/mezoEarn"
import {
  WarehouseUnavailableError,
  withWarehouseFallback,
} from "@/lib/warehouse"

import { THIRD_PARTY_VOTER_SUBGRAPH_ADDRESS } from "./constants"
import { replayVoteEvents } from "./participation"
import {
  fetchWarehouseThirdPartyRewardEvents,
  fetchWarehouseThirdPartyVotes,
  fetchWarehouseVeMezoLockCreations,
  fetchWarehouseVeMezoOwners,
} from "./warehouse"

const voteEventSchema = z.object({
  id: z.string(),
  voter: z.string(),
  timestamp: z.string(),
  type: z.enum(["Voted", "Abstained"]),
  tokenId: z.string(),
  weight: z.string(),
  gauge: z.object({ address: z.string() }),
})

export type SubgraphVote = {
  tokenId: bigint
  // Last address to vote this NFT; only a fallback; snapshots resolve owners.
  owner: string
  gauge: string
  currentWeight: bigint
  lastUpdatedAt: number
}

/**
 * Active third-party votes at a block, rebuilt by replaying every Voted /
 * Abstained event up to the block. The warehouse replays its own rows by
 * block number. Otherwise Mezo's earn-votes subgraph is replayed up to the
 * block's timestamp: its `votePositions` time-travel is pruned to ~1,000
 * blocks, and the replay matches live positions exactly.
 */
export async function fetchActiveThirdPartyVotes(options: {
  blockNumber: bigint
  blockTimestamp: number
}): Promise<SubgraphVote[]> {
  return withWarehouseFallback(
    CHAIN_ID.mainnet,
    "third-party votes",
    () => fetchWarehouseThirdPartyVotes({ blockNumber: options.blockNumber }),
    () => fetchEarnThirdPartyVotes(options.blockTimestamp),
  )
}

// Mezo's earn-votes replay: the source before the warehouse, and its
// fallback.
async function fetchEarnThirdPartyVotes(
  blockTimestamp: number,
): Promise<SubgraphVote[]> {
  const events: z.infer<typeof voteEventSchema>[] = []
  const upTo = secondsToTimeseries(blockTimestamp)
  let lastId = ""
  for (;;) {
    const cursor = lastId ? `, id_gt: "${lastId}"` : ""
    const data = await queryEarnSubgraph(
      EARN_VOTES_MEZO_URL,
      `query {
        voteEvents(
          first: ${EARN_PAGE_SIZE},
          orderBy: id,
          orderDirection: asc,
          where: {
            votingContract: "${THIRD_PARTY_VOTER_SUBGRAPH_ADDRESS}",
            timestamp_lte: "${upTo}"${cursor}
          }
        ) {
          id
          voter
          timestamp
          type
          tokenId
          weight
          gauge { address }
        }
      }`,
    )
    const rows = earnRows(data, "voteEvents", voteEventSchema)
    events.push(...rows)
    const last = rows.at(-1)
    if (rows.length < EARN_PAGE_SIZE || !last) break
    lastId = last.id
  }

  const positions = replayVoteEvents(
    events.map((event) => ({
      tokenId: BigInt(event.tokenId),
      gauge: event.gauge.address,
      type: event.type,
      weight: BigInt(event.weight),
    })),
  )
  const latest = new Map<string, { voter: string; timestamp: number }>()
  for (const event of events) {
    const key = `${event.tokenId}:${event.gauge.address.toLowerCase()}`
    latest.set(key, {
      voter: event.voter,
      timestamp: timeseriesToSeconds(event.timestamp) ?? 0,
    })
  }
  return positions.map((position) => {
    const last = latest.get(`${position.tokenId}:${position.gauge}`)
    return {
      tokenId: position.tokenId,
      owner: last?.voter ?? "",
      gauge: position.gauge,
      currentWeight: position.currentWeight,
      lastUpdatedAt: last?.timestamp ?? 0,
    }
  })
}

/**
 * veMEZO owners from earn-locks `Stake`. Stake is current state only, so
 * historical snapshots attribute an NFT to its latest owner; veMEZO NFTs
 * rarely change hands. NFTs it doesn't know are resolved on-chain by the
 * caller at the snapshot block.
 */
export async function fetchVeMezoOwners(options: {
  tokenIds: bigint[]
}): Promise<Map<string, string>> {
  return withWarehouseFallback(
    CHAIN_ID.mainnet,
    "veMEZO owners",
    () => fetchWarehouseVeMezoOwners(options.tokenIds),
    () => fetchStakeOwners(options.tokenIds, CONTRACTS.mainnet.veMEZO),
  )
}

export type ThirdPartyRewardEvent = {
  gauge: string
  amount: bigint
  timestamp: number
  actionType: "REWARD_DISTRIBUTED" | "REWARD_NOTIFIED"
}

export async function fetchThirdPartyRewardEvents(options: {
  fromTs: number
  toTs: number
}): Promise<ThirdPartyRewardEvent[]> {
  return withWarehouseFallback(
    CHAIN_ID.mainnet,
    "third-party rewards",
    () => fetchWarehouseThirdPartyRewardEvents(options),
    // The deleted explorer subgraph was the only other source. Failing beats
    // reporting zero emissions.
    () =>
      Promise.reject(
        new WarehouseUnavailableError(
          "Third-party rewards are only indexed in the warehouse",
        ),
      ),
  )
}

const stakeCreatedSchema = z.object({
  id: z.string(),
  initializedAt: z.string().nullable(),
})

export type VeMezoLockCreation = {
  timestamp: number
  tokenId: bigint
}

/**
 * New veMEZO locks from earn-locks `Stake.initializedAt`. Matches the
 * explorer's LOCK_CREATED for every lock it indexed (same token ids and
 * timestamps) and also covers locks from before the explorer's start block.
 */
export async function fetchVeMezoLockCreations(options: {
  fromTs: number
  toTs: number
}): Promise<VeMezoLockCreation[]> {
  // The warehouse matches the explorer: locks from block 7,739,500 on.
  return withWarehouseFallback(
    CHAIN_ID.mainnet,
    "veMEZO lock creations",
    () => fetchWarehouseVeMezoLockCreations(options),
    () => fetchEarnLockCreations(options),
  )
}

// Mezo's earn-locks: the source before the warehouse, and its fallback.
async function fetchEarnLockCreations(options: {
  fromTs: number
  toTs: number
}): Promise<VeMezoLockCreation[]> {
  const veMezo = CONTRACTS.mainnet.veMEZO.toLowerCase()
  const locks: VeMezoLockCreation[] = []
  let lastId = ""
  for (;;) {
    const cursor = lastId ? `, id_gt: "${lastId}"` : ""
    const data = await queryEarnSubgraph(
      EARN_LOCKS_MEZO_URL,
      `query {
        stakes(
          first: ${EARN_PAGE_SIZE},
          orderBy: id,
          orderDirection: asc,
          where: {
            token: "${veMezo}",
            initializedAt_gte: "${options.fromTs}",
            initializedAt_lte: "${options.toTs}"${cursor}
          }
        ) {
          id
          initializedAt
        }
      }`,
    )
    const rows = earnRows(data, "stakes", stakeCreatedSchema)
    for (const row of rows) {
      const tokenId = tokenIdFromStakeId(row.id)
      if (tokenId === undefined || row.initializedAt === null) continue
      locks.push({ timestamp: Number(row.initializedAt), tokenId })
    }
    const last = rows.at(-1)
    if (rows.length < EARN_PAGE_SIZE || !last) break
    lastId = last.id
  }
  return locks.sort((a, b) => a.timestamp - b.timestamp)
}
