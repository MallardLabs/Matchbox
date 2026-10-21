import { z } from "zod"

// Mezo's public earn subgraphs. These are Mezo's Goldsky project, not ours:
// the endpoints are shared with their dapp at about 50 requests per 10s.
export const EARN_VOTES_MEZO_URL =
  "https://api.goldsky.com/api/public/project_cm6ks2x8um4aj01uj8nwg1f6r/subgraphs/earn-votes-mezo/v1/gn"
export const EARN_LOCKS_MEZO_URL =
  "https://api.goldsky.com/api/public/project_cm6ks2x8um4aj01uj8nwg1f6r/subgraphs/earn-locks-mezo/v2/gn"

export const EARN_PAGE_SIZE = 1000

// Timeseries entities (VoteEvent) store `timestamp` as unix microseconds.
export const TIMESERIES_MICROSECONDS = 1_000_000n

const RETRY_DELAYS_MS = [400, 1_200, 3_000] as const
const MAX_RETRY_AFTER_MS = 5_000

export class EarnSubgraphError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EarnSubgraphError"
  }
}

const envelopeSchema = z.object({
  data: z.record(z.string(), z.unknown()).nullish(),
  errors: z.array(z.object({ message: z.string() })).optional(),
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryDelay(response: Response | undefined, attempt: number): number {
  const header = response?.headers.get("retry-after")
  const seconds = header ? Number(header) : Number.NaN
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS)
  }
  return RETRY_DELAYS_MS[attempt] ?? MAX_RETRY_AFTER_MS
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * POST a GraphQL query. Retries 429/5xx and network errors with backoff, then
 * throws. GraphQL errors throw immediately; they won't succeed on retry.
 */
export async function queryEarnSubgraph(
  url: string,
  query: string,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt += 1) {
    const canRetry = attempt < RETRY_DELAYS_MS.length
    let response: Response
    try {
      response = await fetch(url, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })
    } catch (error) {
      if (!canRetry) {
        throw new EarnSubgraphError(
          `Earn subgraph unreachable: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      await sleep(retryDelay(undefined, attempt))
      continue
    }
    if (!response.ok) {
      if (isRetryable(response.status) && canRetry) {
        await sleep(retryDelay(response, attempt))
        continue
      }
      throw new EarnSubgraphError(
        `Earn subgraph request failed with ${response.status}`,
      )
    }
    const parsed = envelopeSchema.safeParse(await response.json())
    if (!parsed.success) {
      throw new EarnSubgraphError("Earn subgraph returned an invalid envelope")
    }
    if (parsed.data.errors?.length) {
      throw new EarnSubgraphError(
        `Earn subgraph errors: ${parsed.data.errors.map((e) => e.message).join("; ")}`,
      )
    }
    return parsed.data.data ?? {}
  }
}

/** Parse `data[key]` as rows, throwing on a missing key or a bad row. */
export function earnRows<T>(
  data: Record<string, unknown>,
  key: string,
  rowSchema: z.ZodType<T>,
): T[] {
  const rows = z.array(rowSchema).safeParse(data[key])
  if (!rows.success) {
    throw new EarnSubgraphError(`Earn subgraph returned malformed ${key}`)
  }
  return rows.data
}

/** earn-locks `Stake` ids are `0x{hex tokenId}-{lowercase escrow}`. */
export function stakeEntityId(tokenId: bigint, escrow: string): string {
  return `0x${tokenId.toString(16)}-${escrow.toLowerCase()}`
}

export function tokenIdFromStakeId(id: string): bigint | undefined {
  const [hex] = id.split("-")
  if (!hex || !/^0x[0-9a-fA-F]+$/.test(hex)) return undefined
  return BigInt(hex)
}

export function secondsToTimeseries(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0"
  return (BigInt(Math.trunc(seconds)) * TIMESERIES_MICROSECONDS).toString()
}

/** Accepts seconds or microseconds; returns unix seconds. */
export function timeseriesToSeconds(raw: string): number | undefined {
  if (!/^\d+$/.test(raw)) return undefined
  const value = BigInt(raw)
  // Microsecond values are ≥ 1e15 for any date after 2001.
  const seconds =
    value >= 1_000_000_000_000_000n ? value / TIMESERIES_MICROSECONDS : value
  if (seconds > BigInt(Number.MAX_SAFE_INTEGER)) return undefined
  return Number(seconds)
}

const stakeOwnerSchema = z.object({
  id: z.string(),
  staker: z.object({ id: z.string() }),
})

/**
 * Current NFT owners from earn-locks `Stake.staker`, keyed by tokenId string.
 * Stake is current state only (no block pin): owners are as of now.
 */
export async function fetchStakeOwners(
  tokenIds: readonly bigint[],
  escrow: string,
): Promise<Map<string, string>> {
  const ids = [...new Set(tokenIds.map((id) => stakeEntityId(id, escrow)))]
  const owners = new Map<string, string>()
  const chunk = 200
  const requests: Promise<void>[] = []
  for (let start = 0; start < ids.length; start += chunk) {
    const batch = ids.slice(start, start + chunk)
    requests.push(
      queryEarnSubgraph(
        EARN_LOCKS_MEZO_URL,
        `query {
          stakes(first: ${batch.length}, where: { id_in: ${JSON.stringify(batch)} }) {
            id
            staker { id }
          }
        }`,
      ).then((data) => {
        for (const stake of earnRows(data, "stakes", stakeOwnerSchema)) {
          const tokenId = tokenIdFromStakeId(stake.id)
          if (tokenId !== undefined) {
            owners.set(tokenId.toString(), stake.staker.id.toLowerCase())
          }
        }
      }),
    )
  }
  await Promise.all(requests)
  return owners
}
