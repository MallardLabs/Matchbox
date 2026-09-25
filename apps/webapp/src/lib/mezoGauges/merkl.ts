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

// Boar RPC caps eth_getLogs at a 10,000-block range ("maximum [from, to]
// blocks distance: 10000").
const GET_LOGS_CHUNK = 10_000n
const GET_LOGS_MIN_CHUNK = 2_000n
// Boar RPC rate-limits to ~10 requests/second per IP; keep concurrency low
// and retry rate-limited requests with backoff.
const GET_LOGS_CONCURRENCY = 5
const RATE_LIMIT_RETRIES = 5
const RATE_LIMIT_BACKOFF_MS = 600

/**
 * Latest-block scans bucket `toBlock` down to this granularity so the
 * in-process cache survives the ~4s block cadence.
 */
const LATEST_SCAN_BUCKET = 50n

/**
 * Wrapped-veMEZO distributor activity predates the gauge campaigns
 * (first distributor balance > 0 around block 10.94M, mid/late August).
 * 6 Aug 2026 00:00 UTC is the verified floor — an earlier scan from this
 * timestamp reproduced the SUP-202 baseline exactly (1,349,270 distributed /
 * 500,190 claimed). Anything earlier contains zero transfers.
 */
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
// In-flight dedup: concurrent requests share one scan instead of each
// launching ~40 getLogs calls against the same rate-limited RPC.
const claimsInFlight = new Map<string, Promise<MerklClaims>>()

type ScanState = {
  block: bigint
  distributed: bigint
  claimed: bigint
  claimants: Set<string>
}

/**
 * Cumulative totals committed with the repo, regenerated at build time by
 * `scripts/mezo-gauges-merkl-seed.mjs`. Cold serverless instances resume
 * from here — a full history scan is ~100 eth_getLogs calls and exceeds
 * the function timeout, while a delta from a fresh seed is a handful.
 */
import merklSeed from "./merkl-seed.json"

const toScanState = (raw: {
  block: string
  distributed: string
  claimed: string
  claimants: string[]
}): ScanState => ({
  block: BigInt(raw.block),
  distributed: BigInt(raw.distributed),
  claimed: BigInt(raw.claimed),
  claimants: new Set(raw.claimants),
})

const SEED_STATE: ScanState | undefined =
  typeof merklSeed.block === "string" ? toScanState(merklSeed) : undefined

/**
 * Cumulative states at the baseline and each past epoch close, committed
 * alongside the seed. `at=` queries resume from the newest checkpoint at or
 * before the target block — a bounded delta scan that fits the timeout.
 */
const CHECKPOINT_STATES: ScanState[] = (merklSeed.checkpoints ?? [])
  .map(toScanState)
  .sort((a, b) => (a.block < b.block ? -1 : a.block > b.block ? 1 : 0))

/**
 * Cumulative running totals for "latest" scans. The transfer log is
 * append-only, so after the cold full scan each request only needs to scan
 * the blocks since the last snapshot — a few hundred blocks instead of the
 * full history (Boar RPC bills getLogs by range scanned).
 */
let latestScanState: ScanState | undefined

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

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes("rate limit") ||
    message.includes("Too many requests") ||
    message.includes("429")
  )
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function getTransferLogs(
  client: PublicClient,
  from: bigint,
  to: bigint,
  retriesLeft = RATE_LIMIT_RETRIES,
): Promise<z.infer<typeof transferLogSchema>[]> {
  try {
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
    return z.array(transferLogSchema).parse(raw)
  } catch (error) {
    if (isRateLimitError(error) && retriesLeft > 0) {
      await sleep(
        RATE_LIMIT_BACKOFF_MS * (RATE_LIMIT_RETRIES - retriesLeft + 1),
      )
      return getTransferLogs(client, from, to, retriesLeft - 1)
    }
    // Some RPCs cap eth_getLogs range; halve until the chunk is small enough.
    if (to - from <= GET_LOGS_MIN_CHUNK) throw error
    const mid = from + (to - from) / 2n
    const [a, b] = await Promise.all([
      getTransferLogs(client, from, mid),
      getTransferLogs(client, mid + 1n, to),
    ])
    return [...a, ...b]
  }
}

/**
 * Wrapped-veMEZO flows: `distributed` is everything transferred TO the Merkl
 * Distributor (rewards pushed in for campaigns), `claimed` is what the
 * distributor paid out to users.
 */
async function scanTransferLogs(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<{
  distributed: bigint
  claimed: bigint
  claimants: Set<string>
}> {
  const ranges: { from: bigint; to: bigint }[] = []
  for (let from = fromBlock; from <= toBlock; from += GET_LOGS_CHUNK) {
    ranges.push({
      from,
      to:
        from + GET_LOGS_CHUNK - 1n > toBlock
          ? toBlock
          : from + GET_LOGS_CHUNK - 1n,
    })
  }

  let distributed = 0n
  let claimed = 0n
  const claimants = new Set<string>()
  for (let i = 0; i < ranges.length; i += GET_LOGS_CONCURRENCY) {
    const batches = await Promise.all(
      ranges
        .slice(i, i + GET_LOGS_CONCURRENCY)
        .map((r) => getTransferLogs(client, r.from, r.to)),
    )
    for (const logs of batches) {
      for (const log of logs) {
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
  }
  return { distributed, claimed, claimants }
}

export async function fetchMerklClaims(options: {
  client: PublicClient
  toBlock?: bigint | undefined
}): Promise<MerklClaims> {
  const { client } = options
  // Bucket "latest" scans so the cache is not invalidated by every new block.
  let toBlock = options.toBlock
  if (toBlock === undefined) {
    const latest = await client.getBlockNumber()
    toBlock = latest - (latest % LATEST_SCAN_BUCKET)
  }
  const cacheKey = toBlock.toString()
  const cached = claimsCache.get(cacheKey)
  if (cached) return cached
  const inFlight = claimsInFlight.get(cacheKey)
  if (inFlight) return inFlight

  const pending = fetchMerklClaimsUncached(client, toBlock, options.toBlock)
  claimsInFlight.set(cacheKey, pending)
  try {
    return await pending
  } finally {
    claimsInFlight.delete(cacheKey)
  }
}

async function fetchMerklClaimsUncached(
  client: PublicClient,
  toBlock: bigint,
  requestedToBlock: bigint | undefined,
): Promise<MerklClaims> {
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
    // Incremental: resume from the best available base — the in-process
    // scan state for "latest" requests, otherwise the newest committed
    // checkpoint (seed or per-epoch-close) at or before the target block.
    const committedBase = [
      ...CHECKPOINT_STATES,
      ...(SEED_STATE !== undefined ? [SEED_STATE] : []),
    ]
      .filter((c) => c.block <= toBlock)
      .sort((a, b) => (a.block < b.block ? -1 : a.block > b.block ? 1 : 0))
      .at(-1)
    const resume: ScanState | undefined =
      requestedToBlock === undefined &&
      latestScanState !== undefined &&
      latestScanState.block <= toBlock
        ? latestScanState
        : committedBase
    const fromBlock =
      resume !== undefined
        ? resume.block + 1n
        : (await findBlockAtOrBefore(client, CLAIMS_SCAN_FROM_TS)).number

    const delta =
      fromBlock <= toBlock
        ? await scanTransferLogs(client, fromBlock, toBlock)
        : { distributed: 0n, claimed: 0n, claimants: new Set<string>() }

    const distributed = (resume?.distributed ?? 0n) + delta.distributed
    const claimed = (resume?.claimed ?? 0n) + delta.claimed
    const claimants = new Set(resume?.claimants ?? [])
    for (const c of delta.claimants) claimants.add(c)

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
    claimsCache.set(toBlock.toString(), result)
    if (latestScanState === undefined || toBlock > latestScanState.block) {
      latestScanState = { block: toBlock, distributed, claimed, claimants }
    }
    return result
  } catch (error) {
    try {
      logger.warn({
        message: "Merkl claims scan failed",
        error: error instanceof Error ? error.message : "unknown",
      })
    } catch {
      // pino's transport worker can be dead in dev; logging must never
      // take the request down
    }
    return unavailable
  }
}
