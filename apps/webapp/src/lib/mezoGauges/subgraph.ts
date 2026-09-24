import { CONTRACTS } from "@repo/shared/contracts"
import { z } from "zod"

import { THIRD_PARTY_VOTER_SUBGRAPH_ADDRESS } from "./constants"

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

const voteSchema = z.object({
  tokenId: z.string(),
  owner: z.string(),
  gauge: z.string(),
  currentWeight: z.string(),
  lastUpdatedAt: z.string(),
})

export type SubgraphVote = {
  tokenId: bigint
  owner: string
  gauge: string
  currentWeight: bigint
  lastUpdatedAt: number
}

export async function fetchActiveThirdPartyVotes(
  options: {
    blockNumber?: bigint
  } = {},
): Promise<SubgraphVote[]> {
  const blockClause =
    options.blockNumber !== undefined
      ? `, block: { number: ${options.blockNumber.toString()} }`
      : ""
  const votes: SubgraphVote[] = []
  for (let skip = 0; ; skip += SUBGRAPH_FIRST_MAX) {
    const data = await querySubgraph(`
      query {
        votes(
          first: ${SUBGRAPH_FIRST_MAX},
          skip: ${skip},
          where: { voterContract: "${THIRD_PARTY_VOTER_SUBGRAPH_ADDRESS}", isActive: true }${blockClause}
        ) {
          tokenId
          owner
          gauge
          currentWeight
          lastUpdatedAt
        }
      }
    `)
    const rows = z.array(voteSchema).parse(data.votes ?? [])
    for (const row of rows) {
      votes.push({
        tokenId: BigInt(row.tokenId),
        owner: row.owner,
        gauge: row.gauge,
        currentWeight: BigInt(row.currentWeight),
        lastUpdatedAt: Number(row.lastUpdatedAt),
      })
    }
    if (rows.length < SUBGRAPH_FIRST_MAX) break
  }
  return votes
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

const lockCreatedSchema = z.object({
  timestamp: z.string(),
  tokenId: z.string().nullable(),
  actor: z.string().nullable(),
})

export type VeMezoLockCreation = {
  timestamp: number
  tokenId?: bigint
  actor?: string
}

/**
 * New veMEZO locks. LOCK_CREATED events from the VOTING_ESCROW source are
 * scoped to the veMEZO contract address so veBTC locks don't leak in.
 */
export async function fetchVeMezoLockCreations(options: {
  fromTs: number
  toTs: number
}): Promise<VeMezoLockCreation[]> {
  const veMezo = CONTRACTS.mainnet.veMEZO.toLowerCase()
  const locks: VeMezoLockCreation[] = []
  for (let skip = 0; ; skip += SUBGRAPH_FIRST_MAX) {
    const data = await querySubgraph(`
      query {
        activityEvents(
          first: ${SUBGRAPH_FIRST_MAX},
          skip: ${skip},
          orderBy: timestamp,
          orderDirection: asc,
          where: {
            source: VOTING_ESCROW,
            actionType: LOCK_CREATED,
            contractAddress: "${veMezo}",
            timestamp_gte: "${options.fromTs}",
            timestamp_lte: "${options.toTs}"
          }
        ) {
          timestamp
          tokenId
          actor
        }
      }
    `)
    const rows = z.array(lockCreatedSchema).parse(data.activityEvents ?? [])
    for (const row of rows) {
      locks.push({
        timestamp: Number(row.timestamp),
        ...(row.tokenId ? { tokenId: BigInt(row.tokenId) } : {}),
        ...(row.actor ? { actor: row.actor } : {}),
      })
    }
    if (rows.length < SUBGRAPH_FIRST_MAX) break
  }
  return locks
}
