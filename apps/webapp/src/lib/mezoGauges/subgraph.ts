import { CONTRACTS } from "@repo/shared/contracts"
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

import { THIRD_PARTY_VOTER_SUBGRAPH_ADDRESS } from "./constants"
import { replayVoteEvents } from "./participation"

const SUBGRAPH_FIRST_MAX = 1000

export const MATCHBOX_EXPLORER_SUBGRAPH_MEZO_URL =
  process.env.MATCHBOX_EXPLORER_SUBGRAPH_MEZO_URL ??
  "https://api.goldsky.com/api/public/project_cmoiy2fc3z9sl01rk465n7poh/subgraphs/matchbox-explorer/live/gn"

const subgraphResponseSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
})

async function querySubgraph(query: string): Promise<Record<string, unknown>> {
  const response = await fetch(MATCHBOX_EXPLORER_SUBGRAPH_MEZO_URL, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) {
    throw new Error(`Subgraph request failed with ${response.status}`)
  }
  const json = subgraphResponseSchema.parse(await response.json())
  if (json.errors?.length) {
    throw new Error(
      `Subgraph errors: ${json.errors.map((e) => e.message).join("; ")}`,
    )
  }
  return json.data ?? {}
}

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
 * Abstained event up to the block's timestamp from Mezo's earn-votes
 * subgraph. Its `votePositions` time-travel is pruned to ~1,000 blocks, and
 * the replay matches live positions exactly.
 */
export async function fetchActiveThirdPartyVotes(options: {
  blockTimestamp: number
}): Promise<SubgraphVote[]> {
  const events: z.infer<typeof voteEventSchema>[] = []
  const upTo = secondsToTimeseries(options.blockTimestamp)
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
  return fetchStakeOwners(options.tokenIds, CONTRACTS.mainnet.veMEZO)
}

const gaugeSchema = z.object({
  address: z.string(),
  isAlive: z.boolean(),
  createdAt: z.string().nullable(),
  killedAt: z.string().nullable(),
  rewardContract: z.string().nullable(),
})

export type SubgraphGauge = z.infer<typeof gaugeSchema>

export async function fetchThirdPartyGauges(): Promise<SubgraphGauge[]> {
  const data = await querySubgraph(`
    query {
      gauges(first: ${SUBGRAPH_FIRST_MAX}, where: { source: THIRD_PARTY_VOTER }) {
        address
        isAlive
        createdAt
        killedAt
        rewardContract
      }
    }
  `)
  return z.array(gaugeSchema).parse(data.gauges ?? [])
}

const rewardEventSchema = z.object({
  gauge: z.string().nullable(),
  amount: z.string().nullable(),
  timestamp: z.string(),
})

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
  const events: ThirdPartyRewardEvent[] = []
  for (const actionType of ["REWARD_DISTRIBUTED", "REWARD_NOTIFIED"] as const) {
    for (let skip = 0; ; skip += SUBGRAPH_FIRST_MAX) {
      const data = await querySubgraph(`
        query {
          activityEvents(
            first: ${SUBGRAPH_FIRST_MAX},
            skip: ${skip},
            orderBy: timestamp,
            orderDirection: asc,
            where: {
              source: THIRD_PARTY_VOTER,
              actionType: ${actionType},
              timestamp_gte: "${options.fromTs}",
              timestamp_lte: "${options.toTs}"
            }
          ) {
            gauge
            amount
            timestamp
          }
        }
      `)
      const rows = z.array(rewardEventSchema).parse(data.activityEvents ?? [])
      for (const row of rows) {
        if (!row.gauge || !row.amount) continue
        events.push({
          gauge: row.gauge,
          amount: BigInt(row.amount),
          timestamp: Number(row.timestamp),
          actionType,
        })
      }
      if (rows.length < SUBGRAPH_FIRST_MAX) break
    }
  }
  return events
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
