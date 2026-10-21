import { CONTRACTS } from "@repo/shared/contracts"
import { z } from "zod"
import type {
  WireActivityItem,
  WireActivityTx,
  WireFreshness,
} from "../../features/history/schema"
import { type WorkerEnv, cached } from "../router"
import {
  WAREHOUSE_COLUMNS,
  collapseRevotes,
  compareActivityDesc,
  explorerResponseSchema,
  fromExplorerItem,
  fromWarehouseRow,
} from "./activity"
import { mezoHistoryClient } from "./chain"
import { enrichActivity } from "./enrich"
import { HistoryError, decodeCursor, encodeCursor } from "./http"
import { epochStartOf } from "./math"
import {
  type SqlQuery,
  type SqlRow,
  WarehouseUnavailableError,
  queryBatch,
  sqlParams,
} from "./neon"

// Activity comes from the Matchbox warehouse (Neon, read-only role) when a
// connection string is configured, else from the public explorer API, which
// is frozen at its last subgraph block apart from vote rows. Freshness always
// says which, so the UI can show "Stale" honestly. Rows are never invented.

const DEFAULT_EXPLORER_ORIGIN = "https://app.matchbox.markets"
const NETWORK = "mezo"
const STALE_SECONDS = 600
const SECONDS_PER_BLOCK = 3.84
/** Explorer actions that only the frozen subgraph serves (not earn-votes). */
const EXPLORER_PROBE_ACTIONS =
  "LOCK_CREATED,LOCK_AMOUNT_INCREASED,BOOST_POKE,INCENTIVE_ADDED,EPOCH_PROCESSED,VOTE_BRIBE_CLAIMED"

export type SourceConfig = {
  warehouseUrl: string | undefined
  explorerOrigin: string
}

/** The warehouse is used whenever MATCHBOX_WAREHOUSE_URL is set. */
export function sourceConfig(
  env: Pick<WorkerEnv, "MATCHBOX_WAREHOUSE_URL" | "MATCHBOX_API_ORIGIN">,
): SourceConfig {
  const url = env.MATCHBOX_WAREHOUSE_URL?.trim()
  const origin = env.MATCHBOX_API_ORIGIN?.trim()
  return {
    warehouseUrl: url ? url : undefined,
    explorerOrigin: (origin ? origin : DEFAULT_EXPLORER_ORIGIN).replace(
      /\/$/,
      "",
    ),
  }
}

export type ActivityQuery = {
  wallet: string | undefined
  actionTypes: readonly string[]
  gauge: string | undefined
  source: string | undefined
  from: number
  to: number
  limit: number
  cursor: string | null
}

export type ActivityResult = {
  items: WireActivityItem[]
  nextCursor: string | null
  freshness: WireFreshness
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

async function headBlock(): Promise<bigint | null> {
  try {
    return await cached("history:head", 15_000, () =>
      mezoHistoryClient().getBlockNumber(),
    )
  } catch {
    return null
  }
}

export function freshnessFrom(input: {
  source: WireFreshness["source"]
  indexedBlock: bigint
  indexedAt: number
  head: bigint | null
  now: number
  frozen: boolean
}): WireFreshness {
  const lagBlocks =
    input.head !== null && input.head > input.indexedBlock
      ? input.head - input.indexedBlock
      : 0n
  const sinceUpdate = Math.max(0, input.now - input.indexedAt)
  const lagSeconds = input.frozen
    ? sinceUpdate
    : Math.max(
        Math.round(Number(lagBlocks) * SECONDS_PER_BLOCK),
        input.head === null ? sinceUpdate : 0,
      )
  const stale =
    input.frozen || lagSeconds > STALE_SECONDS || sinceUpdate > STALE_SECONDS
  return {
    source: input.source,
    indexedThroughBlock: input.indexedBlock.toString(),
    indexedAt: new Date(input.indexedAt * 1000).toISOString(),
    headBlock: input.head === null ? null : input.head.toString(),
    lagBlocks: input.head === null ? null : lagBlocks.toString(),
    lagSeconds,
    state: stale ? "stale" : "fresh",
  }
}

export const UNAVAILABLE_ACTIVITY: WireFreshness = {
  source: "warehouse",
  indexedThroughBlock: null,
  indexedAt: null,
  headBlock: null,
  lagBlocks: null,
  lagSeconds: null,
  state: "unavailable",
}

// ------------------------------------------------------------ warehouse

const SELECT = WAREHOUSE_COLUMNS.map(
  (column) => `a.${column}::text AS ${column}`,
).join(", ")

const CHECKPOINT_QUERY: SqlQuery = {
  text: `SELECT last_block::text AS last_block,
      extract(epoch FROM updated_at)::bigint::text AS updated_at
    FROM matchbox.indexer_checkpoints
    WHERE network = $1 AND stream = 'projection'`,
  params: [NETWORK],
}

const checkpointSchema = z.object({
  last_block: z.string().regex(/^\d+$/),
  updated_at: z.string().regex(/^\d+$/),
})

async function warehouseFreshness(
  rows: readonly SqlRow[],
): Promise<WireFreshness> {
  const parsed = checkpointSchema.safeParse(rows[0])
  if (!parsed.success) return UNAVAILABLE_ACTIVITY
  return freshnessFrom({
    source: "warehouse",
    indexedBlock: BigInt(parsed.data.last_block),
    indexedAt: Number(parsed.data.updated_at),
    head: await headBlock(),
    now: nowSeconds(),
    frozen: false,
  })
}

const warehouseCursorSchema = z.object({
  t: z.string().regex(/^\d+$/),
  b: z.string().regex(/^\d+$/),
  l: z.number().int().nonnegative(),
  id: z.string(),
})

/** Wallet scope: actor or recipient, its pokes, and votes cast for its locks. */
export function buildWarehouseActivityQuery(query: ActivityQuery): SqlQuery {
  const { params, add } = sqlParams()
  const network = add(NETWORK)
  const where = [
    `a.network = ${network}`,
    `a.timestamp >= ${add(query.from)}`,
    `a.timestamp <= ${add(query.to)}`,
  ]
  if (query.wallet) {
    const wallet = add(query.wallet)
    const veMezo = add(CONTRACTS.mainnet.veMEZO.toLowerCase())
    const veBtc = add(CONTRACTS.mainnet.veBTC.toLowerCase())
    const locks = (escrow: string) =>
      `SELECT lp.token_id FROM matchbox.lock_positions lp
        WHERE lp.network = ${network} AND lp.owner = ${wallet}
          AND lp.contract_address = ${escrow}`
    where.push(`(a.actor = ${wallet} OR a.recipient = ${wallet}
      OR (a.action_type = 'BOOST_POKE' AND a.tx_from = ${wallet})
      OR (a.action_type IN ('BOOST_VOTE', 'BOOST_ABSTAIN') AND (
        (a.source IN ('BOOST_VOTER', 'THIRD_PARTY_VOTER')
          AND a.token_id IN (${locks(veMezo)}))
        OR (a.source IN ('POOLS_VOTER', 'VALIDATORS_VOTER')
          AND a.token_id IN (${locks(veBtc)})))))`)
  }
  if (query.actionTypes.length > 0) {
    where.push(`a.action_type = ANY(${add(query.actionTypes)}::text[])`)
  }
  if (query.gauge) where.push(`a.gauge = ${add(query.gauge)}`)
  if (query.source) where.push(`a.source = ${add(query.source)}`)
  const cursor = warehouseCursorSchema.safeParse(decodeCursor(query.cursor))
  if (query.cursor && !cursor.success) {
    throw new HistoryError(400, "invalid_request", "Invalid cursor.")
  }
  if (cursor.success) {
    where.push(`(a.timestamp, a.block_number, a.log_index, a.id COLLATE "C") <
      (${add(cursor.data.t)}::bigint, ${add(cursor.data.b)}::bigint,
       ${add(cursor.data.l)}::bigint, ${add(cursor.data.id)}::text COLLATE "C")`)
  }
  return {
    text: `SELECT ${SELECT}
      FROM matchbox.activity_events a
      WHERE ${where.join(" AND ")}
      ORDER BY a.timestamp DESC, a.block_number DESC, a.log_index DESC,
        a.id COLLATE "C" DESC
      LIMIT ${add(query.limit + 1)}`,
    params,
  }
}

function warehouseUnavailable(error: unknown): HistoryError {
  return new HistoryError(
    503,
    "warehouse_unavailable",
    "Activity index is unavailable right now.",
    error,
  )
}

async function warehouseActivity(
  url: string,
  query: ActivityQuery,
  fetcher: typeof fetch,
): Promise<ActivityResult> {
  let rows: SqlRow[]
  let checkpoint: SqlRow[]
  try {
    ;[rows = [], checkpoint = []] = await queryBatch(
      url,
      [buildWarehouseActivityQuery(query), CHECKPOINT_QUERY],
      fetcher,
    )
  } catch (error) {
    if (error instanceof WarehouseUnavailableError) {
      throw warehouseUnavailable(error)
    }
    throw error
  }
  const page = rows.slice(0, query.limit)
  const items = page.flatMap((row) => {
    const item = fromWarehouseRow(row)
    return item ? [item] : []
  })
  const last = items[items.length - 1]
  return {
    items: await enrichActivity(collapseRevotes(items)),
    nextCursor:
      rows.length > query.limit && last
        ? encodeCursor({
            t: last.timestamp,
            b: last.blockNumber,
            l: last.logIndex ?? 0,
            id: last.id,
          })
        : null,
    freshness: await warehouseFreshness(checkpoint),
  }
}

// -------------------------------------------------------------- explorer

const explorerCursorSchema = z.object({ p: z.number().int().nonnegative() })

type ExplorerProbe = { block: bigint; timestamp: number }

async function explorerFetch(
  origin: string,
  params: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ items: WireActivityItem[]; hasMore: boolean }> {
  const search = new URLSearchParams({
    network: NETWORK,
    order: "desc",
    ...params,
  })
  let response: Response
  try {
    response = await fetcher(`${origin}/api/activity?${search}`, {
      signal: AbortSignal.timeout(20_000),
      headers: { accept: "application/json" },
    })
  } catch (error) {
    throw new HistoryError(
      503,
      "warehouse_unavailable",
      "Activity is unavailable right now.",
      error,
    )
  }
  if (!response.ok) {
    throw new HistoryError(
      503,
      "warehouse_unavailable",
      "Activity is unavailable right now.",
    )
  }
  const body = explorerResponseSchema.safeParse(await response.json())
  if (!body.success) {
    throw new HistoryError(
      503,
      "warehouse_unavailable",
      "Activity is unavailable right now.",
    )
  }
  return {
    items: body.data.data.flatMap((row) => {
      const item = fromExplorerItem(row)
      return item ? [item] : []
    }),
    hasMore: body.data.hasMore,
  }
}

/** The explorer's newest non-vote row marks how far it is indexed. */
async function explorerProbe(
  origin: string,
  fetcher: typeof fetch,
): Promise<ExplorerProbe | null> {
  return cached(`history:explorer-probe:${origin}`, 10 * 60_000, async () => {
    const now = nowSeconds()
    const { items } = await explorerFetch(
      origin,
      {
        limit: "1",
        from: String(now - 365 * 86_400),
        to: String(now),
        actionTypes: EXPLORER_PROBE_ACTIONS,
      },
      fetcher,
    )
    const newest = items[0]
    return newest
      ? {
          block: BigInt(newest.blockNumber),
          timestamp: Number(newest.timestamp),
        }
      : null
  })
}

async function explorerFreshness(
  origin: string,
  fetcher: typeof fetch,
): Promise<WireFreshness> {
  const [probe, head] = await Promise.all([
    explorerProbe(origin, fetcher).catch(() => null),
    headBlock(),
  ])
  if (!probe) return { ...UNAVAILABLE_ACTIVITY, source: "frozen-explorer" }
  return freshnessFrom({
    source: "frozen-explorer",
    indexedBlock: probe.block,
    indexedAt: probe.timestamp,
    head,
    now: nowSeconds(),
    frozen: true,
  })
}

async function explorerActivity(
  origin: string,
  query: ActivityQuery,
  fetcher: typeof fetch,
): Promise<ActivityResult> {
  const cursor = explorerCursorSchema.safeParse(decodeCursor(query.cursor))
  if (query.cursor && !cursor.success) {
    throw new HistoryError(400, "invalid_request", "Invalid cursor.")
  }
  const page = cursor.success ? cursor.data.p : 0
  const params: Record<string, string> = {
    limit: String(query.limit),
    page: String(page),
    from: String(query.from),
    to: String(query.to),
  }
  if (query.wallet) params.actor = query.wallet
  if (query.gauge) params.gauge = query.gauge
  if (query.actionTypes.length > 0) {
    params.actionTypes = query.actionTypes.join(",")
  }
  if (query.source === "VALIDATORS_VOTER") params.contract = "validatorsVoter"
  const [result, freshness] = await Promise.all([
    explorerFetch(origin, params, fetcher),
    explorerFreshness(origin, fetcher),
  ])
  const items = [...result.items].sort(compareActivityDesc)
  return {
    items: await enrichActivity(collapseRevotes(items)),
    nextCursor: result.hasMore ? encodeCursor({ p: page + 1 }) : null,
    freshness,
  }
}

// ------------------------------------------------------------ public API

export async function queryActivity(
  config: SourceConfig,
  query: ActivityQuery,
  fetcher: typeof fetch = fetch,
): Promise<ActivityResult> {
  return config.warehouseUrl
    ? warehouseActivity(config.warehouseUrl, query, fetcher)
    : explorerActivity(config.explorerOrigin, query, fetcher)
}

export async function activityFreshness(
  config: SourceConfig,
  fetcher: typeof fetch = fetch,
): Promise<WireFreshness> {
  if (!config.warehouseUrl) {
    return explorerFreshness(config.explorerOrigin, fetcher)
  }
  try {
    const [checkpoint = []] = await queryBatch(
      config.warehouseUrl,
      [CHECKPOINT_QUERY],
      fetcher,
    )
    return await warehouseFreshness(checkpoint)
  } catch {
    return UNAVAILABLE_ACTIVITY
  }
}

type TxRef = { blockNumber: bigint; timestamp: bigint; from: string | null }

async function txRef(hash: `0x${string}`): Promise<TxRef | null> {
  try {
    const rpc = mezoHistoryClient()
    const tx = await rpc.getTransaction({ hash })
    if (tx.blockNumber === null) return null
    const block = await rpc.getBlock({ blockNumber: tx.blockNumber })
    return {
      blockNumber: tx.blockNumber,
      timestamp: block.timestamp,
      from: tx.from.toLowerCase(),
    }
  } catch {
    return null
  }
}

function txView(
  hash: string,
  ref: TxRef | null,
  items: WireActivityItem[],
  indexed: WireFreshness,
): WireActivityTx {
  const first = items[0]
  const blockNumber =
    ref?.blockNumber ?? (first ? BigInt(first.blockNumber) : null)
  const timestamp = ref?.timestamp ?? (first ? BigInt(first.timestamp) : null)
  const indexedThrough =
    indexed.indexedThroughBlock === null
      ? null
      : BigInt(indexed.indexedThroughBlock)
  let index: WireActivityTx["index"] = "indexed"
  if (items.length === 0) {
    index =
      ref && indexedThrough !== null && ref.blockNumber > indexedThrough
        ? "pending_index"
        : "not_indexed"
  }
  return {
    index,
    tx:
      blockNumber !== null && timestamp !== null
        ? {
            hash,
            blockNumber: blockNumber.toString(),
            timestamp: timestamp.toString(),
            from: ref?.from ?? first?.txFrom ?? null,
            epochStart: epochStartOf(timestamp).toString(),
          }
        : null,
    items: collapseRevotes(items),
  }
}

/** Every indexed row of one transaction, oldest log first. */
export async function queryTx(
  config: SourceConfig,
  hash: `0x${string}`,
  fetcher: typeof fetch = fetch,
): Promise<{ data: WireActivityTx; freshness: WireFreshness }> {
  if (config.warehouseUrl) {
    const { params, add } = sqlParams()
    const text = `SELECT ${SELECT} FROM matchbox.activity_events a
      WHERE a.network = ${add(NETWORK)} AND a.tx_hash = ${add(hash)}
      ORDER BY a.log_index ASC, a.id COLLATE "C" ASC`
    let rows: SqlRow[]
    let checkpoint: SqlRow[]
    try {
      ;[rows = [], checkpoint = []] = await queryBatch(
        config.warehouseUrl,
        [{ text, params }, CHECKPOINT_QUERY],
        fetcher,
      )
    } catch (error) {
      if (error instanceof WarehouseUnavailableError) {
        throw warehouseUnavailable(error)
      }
      throw error
    }
    const items = rows.flatMap((row) => {
      const item = fromWarehouseRow(row)
      return item ? [item] : []
    })
    const [freshness, ref] = await Promise.all([
      warehouseFreshness(checkpoint),
      items.length === 0 ? txRef(hash) : Promise.resolve(null),
    ])
    await enrichActivity(items)
    return { data: txView(hash, ref, items, freshness), freshness }
  }

  const [ref, freshness] = await Promise.all([
    txRef(hash),
    explorerFreshness(config.explorerOrigin, fetcher),
  ])
  if (!ref) return { data: txView(hash, null, [], freshness), freshness }
  // The explorer has no tx filter: read that block's second and match.
  const second = ref.timestamp.toString()
  const { items } = await explorerFetch(
    config.explorerOrigin,
    { limit: "1000", from: second, to: second },
    fetcher,
  )
  const matches = items
    .filter((item) => item.txHash === hash)
    .sort((a, b) => (a.logIndex ?? 0) - (b.logIndex ?? 0))
  await enrichActivity(matches)
  return { data: txView(hash, ref, matches, freshness), freshness }
}
