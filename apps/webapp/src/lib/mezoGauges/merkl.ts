import { createLogger } from "@repo/shared/logger"
import type { PublicClient } from "viem"
import { z } from "zod"

import { findBlockAtOrBefore } from "./blocks"
import { MEZO_GAUGES } from "./constants"

const logger = createLogger("mezo-gauges-merkl")

/**
 * Merkl Distributor on Mezo (chainId 31612), resolved from wrapped-veMEZO
 * Transfer logs: it is the dominant sender (71 outbound transfers at
 * verification time) and matches the truncated address in the brief.
 */
export const MERKL_DISTRIBUTOR =
  "0x3Ef3D8bA38eBe18Db133CeC108f4d14CE00dd9Ae" as const

/** Wrapped veMEZO reward token on Mezo, from the Merkl v4 rewardsRecord. */
export const MERKL_REWARD_TOKEN =
  "0x089A6af90041c3ac734cbdeFa84832Aa7fBF67C8" as const

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const DISTRIBUTOR_LOWER = MERKL_DISTRIBUTOR.toLowerCase()
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

const GET_LOGS_CHUNK = 10_000n

/** Campaigns began around the launch window; scan from 6 Aug 2026 00:00 UTC. */
const CLAIMS_SCAN_FROM_TS = 1_786_022_400

const campaignsResponseSchema = z.array(
  z.object({
    id: z.string(),
    campaignId: z.string().optional(),
    opportunityId: z.string().optional(),
    amount: z.string().optional(),
    apr: z.union([z.string(), z.number()]).optional(),
    startTimestamp: z.union([z.string(), z.number()]).optional(),
    endTimestamp: z.union([z.string(), z.number()]).optional(),
    creatorAddress: z.string().optional(),
    rewardTokenId: z.string().optional(),
  }),
)

export type MerklCampaign = {
  id: string
  campaignId?: string
  opportunityId?: string
  amount: string | null
  apr: string | null
  startTimestamp: number | null
  endTimestamp: number | null
  rewardToken: string
}

export type MerklClaims = {
  status: "ok" | "unavailable"
  distributor: string
  rewardToken: string
  /** Wrapped veMEZO pushed to the Merkl Distributor (SUP-202 definition). */
  distributed: string
  /** Wrapped veMEZO paid out to users by the Merkl distributor. */
  claimed: string
  unclaimed: string
  claimRateBps: string
  claimants: number
}

const claimsCache = new Map<string, MerklClaims>()

export async function fetchMerklCampaigns(): Promise<
  Record<string, MerklCampaign[]>
> {
  const out: Record<string, MerklCampaign[]> = {}
  await Promise.all(
    Object.entries(MEZO_GAUGES).map(async ([gauge, config]) => {
      if (!config.merklOpportunityId) return
      try {
        const response = await fetch(
          `https://api.merkl.xyz/v4/campaigns?opportunityId=${config.merklOpportunityId}`,
          { cache: "no-store" },
        )
        if (!response.ok) throw new Error(`merkl ${response.status}`)
        const campaigns = campaignsResponseSchema.parse(await response.json())
        out[gauge] = campaigns.map((c) => ({
          id: c.id,
          ...(c.campaignId ? { campaignId: c.campaignId } : {}),
          ...(c.opportunityId ? { opportunityId: c.opportunityId } : {}),
          amount: c.amount ?? null,
          apr: c.apr != null ? String(c.apr) : null,
          startTimestamp:
            c.startTimestamp != null ? Number(c.startTimestamp) : null,
          endTimestamp: c.endTimestamp != null ? Number(c.endTimestamp) : null,
          rewardToken: MERKL_REWARD_TOKEN,
        }))
      } catch (error) {
        logger.warn({
          message: "Merkl campaigns fetch failed",
          gauge,
          error: error instanceof Error ? error.message : "unknown",
        })
        out[gauge] = []
      }
    }),
  )
  return out
}

const transferLogSchema = z.object({
  topics: z.array(z.string()),
  data: z.string(),
})

function topicAddress(topic: string | undefined): string {
  return topic ? `0x${topic.slice(26).toLowerCase()}` : ""
}

/**
 * Wrapped-veMEZO flows: `distributed` is everything transferred TO the Merkl
 * Distributor (rewards pushed in for campaigns), `claimed` is what the
 * distributor paid out to users.
 */
export async function fetchMerklClaims(options: {
  client: PublicClient
  toBlock?: bigint | undefined
}): Promise<MerklClaims> {
  const { client } = options
  const toBlock = options.toBlock ?? (await client.getBlockNumber())
  const cacheKey = toBlock.toString()
  const cached = claimsCache.get(cacheKey)
  if (cached) return cached

  const unavailable: MerklClaims = {
    status: "unavailable",
    distributor: MERKL_DISTRIBUTOR,
    rewardToken: MERKL_REWARD_TOKEN,
    distributed: "0",
    claimed: "0",
    unclaimed: "0",
    claimRateBps: "0",
    claimants: 0,
  }

  try {
    const fromBlock = (await findBlockAtOrBefore(client, CLAIMS_SCAN_FROM_TS))
      .number

    let distributed = 0n
    let claimed = 0n
    const claimants = new Set<string>()
    for (let from = fromBlock; from <= toBlock; from += GET_LOGS_CHUNK) {
      const to =
        from + GET_LOGS_CHUNK - 1n > toBlock
          ? toBlock
          : from + GET_LOGS_CHUNK - 1n
      const raw = await client.request({
        method: "eth_getLogs",
        params: [
          {
            address: MERKL_REWARD_TOKEN,
            topics: [TRANSFER_TOPIC],
            fromBlock: `0x${from.toString(16)}`,
            toBlock: `0x${to.toString(16)}`,
          },
        ],
      })
      for (const log of z.array(transferLogSchema).parse(raw)) {
        const sender = topicAddress(log.topics[1])
        const recipient = topicAddress(log.topics[2])
        const amount = BigInt(log.data)
        if (recipient === DISTRIBUTOR_LOWER) {
          distributed += amount
        }
        if (sender === DISTRIBUTOR_LOWER) {
          claimed += amount
          if (recipient !== ZERO_ADDRESS) claimants.add(recipient)
        }
      }
    }

    const unclaimed = distributed > claimed ? distributed - claimed : 0n
    const claimRateBps =
      distributed > 0n ? (claimed * 10_000n) / distributed : 0n
    const result: MerklClaims = {
      status: "ok",
      distributor: MERKL_DISTRIBUTOR,
      rewardToken: MERKL_REWARD_TOKEN,
      distributed: distributed.toString(),
      claimed: claimed.toString(),
      unclaimed: unclaimed.toString(),
      claimRateBps: claimRateBps.toString(),
      claimants: claimants.size,
    }
    claimsCache.set(cacheKey, result)
    return result
  } catch (error) {
    logger.warn({
      message: "Merkl claims scan failed",
      error: error instanceof Error ? error.message : "unknown",
    })
    return unavailable
  }
}
