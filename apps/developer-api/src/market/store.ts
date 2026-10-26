import { parseJson } from "@repo/platform-contracts/encoding"
import {
  type Gauge,
  type GaugeIncentives,
  type VoterKind,
  gaugeIncentivesSchema,
  gaugeSchema,
  marketMetaSchema,
  voterTotalWeightsSchema,
} from "@repo/platform-contracts/market"
import {
  type NetworkSlug,
  networkSlugSchema,
} from "@repo/platform-contracts/network"
import { sha256Base64Url } from "@repo/platform-server"
import { z } from "zod"
import type { MarketSnapshot, StoredEpoch, StoredGauge } from "./snapshot"

/**
 * Storage boundary for market snapshots. The cron writes; routes read.
 * `createD1MarketStore` is production; `createMemoryMarketStore` backs tests
 * and `PLATFORM_STORE=memory`.
 */

export type GaugeFilter = {
  voter: VoterKind | null
  /** Lower-case gauge addresses; null = every gauge. */
  gauges: readonly string[] | null
}

export type GaugeHistoryEntry = {
  epoch: StoredEpoch
  incentives: GaugeIncentives
}

export type SnapshotWriteSummary = {
  epochs: number
  written: number
  unchanged: number
}

export type MarketStore = {
  /** Newest epoch header at or before `epochStart`. */
  latestEpoch(
    network: NetworkSlug,
    epochStart: number,
  ): Promise<StoredEpoch | null>
  getEpoch(
    network: NetworkSlug,
    epochStart: number,
  ): Promise<StoredEpoch | null>
  listGauges(
    network: NetworkSlug,
    epochStart: number,
    filter: GaugeFilter,
  ): Promise<Gauge[]>
  /** Gauges with at least one non-zero reward in the epoch. */
  listIncentives(
    network: NetworkSlug,
    epochStart: number,
    filter: GaugeFilter,
  ): Promise<GaugeIncentives[]>
  getGauge(
    network: NetworkSlug,
    epochStart: number,
    gaugeAddress: string,
  ): Promise<StoredGauge | null>
  getGaugeByVebtc(
    network: NetworkSlug,
    epochStart: number,
    tokenId: string,
  ): Promise<StoredGauge | null>
  /** A gauge's epochs at or before `maxEpochStart`, newest first. */
  listGaugeHistory(
    network: NetworkSlug,
    gaugeAddress: string,
    maxEpochStart: number,
    limit: number,
  ): Promise<GaugeHistoryEntry[]>
  /** Boost gauge → veBTC token id, from the newest epoch at or before. */
  boostTokens(
    network: NetworkSlug,
    epochStart: number,
  ): Promise<Map<string, string>>
  saveSnapshot(snapshot: MarketSnapshot): Promise<SnapshotWriteSummary>
}

/** Hash of a stored row; rows whose hash is unchanged are not rewritten. */
export function storedGaugeHash(row: StoredGauge): Promise<string> {
  return sha256Base64Url(JSON.stringify(row))
}

function vebtcTokenOf(gauge: Gauge): string | null {
  return gauge.voter === "boost" ? gauge.vebtcTokenId : null
}

function matchesFilter(
  row: { voter: VoterKind; gaugeAddress: string },
  filter: GaugeFilter,
): boolean {
  if (filter.voter !== null && row.voter !== filter.voter) return false
  return filter.gauges === null || filter.gauges.includes(row.gaugeAddress)
}

function compareGauges(
  left: { voter: VoterKind; gaugeAddress: string },
  right: { voter: VoterKind; gaugeAddress: string },
): number {
  if (left.voter !== right.voter) return left.voter < right.voter ? -1 : 1
  if (left.gaugeAddress === right.gaugeAddress) return 0
  return left.gaugeAddress < right.gaugeAddress ? -1 : 1
}

// ---------------------------------------------------------------------------
// D1
// ---------------------------------------------------------------------------

/** A TEXT column holding JSON, validated against `schema`. */
function jsonColumn<Schema extends z.ZodType>(schema: Schema) {
  return z
    .string()
    .transform((text, context) => {
      const parsed = parseJson(text)
      if (!parsed.ok) {
        context.addIssue({ code: "custom", message: "Invalid JSON column" })
        return z.NEVER
      }
      return parsed.value
    })
    .pipe(schema)
}

const epochRowSchema = z
  .object({
    network: networkSlugSchema,
    epoch_start: z.number().int(),
    block_number: z.string(),
    as_of: z.string(),
    total_weights: jsonColumn(voterTotalWeightsSchema),
    prices: jsonColumn(marketMetaSchema.shape.prices),
  })
  .transform(
    (row): StoredEpoch => ({
      network: row.network,
      epochStart: row.epoch_start,
      blockNumber: row.block_number,
      asOf: row.as_of,
      totalWeights: row.total_weights,
      prices: row.prices,
    }),
  )

const gaugeRowSchema = z
  .object({ gauge: jsonColumn(gaugeSchema) })
  .transform((row) => row.gauge)

const incentivesRowSchema = z
  .object({ incentives: jsonColumn(gaugeIncentivesSchema) })
  .transform((row) => row.incentives)

const storedGaugeRowSchema = z
  .object({
    gauge: jsonColumn(gaugeSchema),
    incentives: jsonColumn(gaugeIncentivesSchema),
  })
  .transform((row): StoredGauge => row)

const hashRowSchema = z.object({
  gauge_address: z.string(),
  hash: z.string(),
})

const tokenRowSchema = z.object({
  gauge_address: z.string(),
  vebtc_token_id: z.string(),
})

const historyRowSchema = z
  .object({
    network: networkSlugSchema,
    epoch_start: z.number().int(),
    block_number: z.string(),
    as_of: z.string(),
    total_weights: jsonColumn(voterTotalWeightsSchema),
    prices: jsonColumn(marketMetaSchema.shape.prices),
    incentives: jsonColumn(gaugeIncentivesSchema),
  })
  .transform(
    (row): GaugeHistoryEntry => ({
      epoch: {
        network: row.network,
        epochStart: row.epoch_start,
        blockNumber: row.block_number,
        asOf: row.as_of,
        totalWeights: row.total_weights,
        prices: row.prices,
      },
      incentives: row.incentives,
    }),
  )

/** The slice of D1 the store uses; tests run it on `node:sqlite`. */
export type MarketStatement = {
  bind(...values: unknown[]): MarketStatement
  first(): Promise<Record<string, unknown> | null>
  all(): Promise<{ results: Record<string, unknown>[] }>
  run(): Promise<unknown>
}

export type MarketDatabase = {
  prepare(query: string): MarketStatement
  batch(statements: MarketStatement[]): Promise<unknown>
}

/** D1 allows 100 bound parameters per statement; keep batches modest. */
const writeBatchSize = 50

function chunk<Item>(items: readonly Item[], size: number): Item[][] {
  const chunks: Item[][] = []
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size))
  }
  return chunks
}

/** `AND gauge_address IN (?, …)` plus its bindings, or nothing. */
function filterSql(filter: GaugeFilter): { sql: string; bindings: string[] } {
  const parts: string[] = []
  const bindings: string[] = []
  if (filter.voter !== null) {
    parts.push("AND voter = ?")
    bindings.push(filter.voter)
  }
  if (filter.gauges !== null) {
    if (filter.gauges.length === 0) {
      parts.push("AND 0")
    } else {
      parts.push(
        `AND gauge_address IN (${filter.gauges.map(() => "?").join(", ")})`,
      )
      bindings.push(...filter.gauges)
    }
  }
  return { sql: parts.join(" "), bindings }
}

const orderByGauge = "ORDER BY voter ASC, gauge_address ASC"

export function createD1MarketStore(db: MarketDatabase): MarketStore {
  async function epochRow(
    sql: string,
    bindings: readonly (string | number)[],
  ): Promise<StoredEpoch | null> {
    const row = await db
      .prepare(sql)
      .bind(...bindings)
      .first()
    return row === null ? null : epochRowSchema.parse(row)
  }

  async function storedGauge(
    sql: string,
    bindings: readonly (string | number)[],
  ): Promise<StoredGauge | null> {
    const row = await db
      .prepare(sql)
      .bind(...bindings)
      .first()
    return row === null ? null : storedGaugeRowSchema.parse(row)
  }

  function latestEpoch(
    network: NetworkSlug,
    epochStart: number,
  ): Promise<StoredEpoch | null> {
    return epochRow(
      `SELECT * FROM market_epochs
        WHERE network = ? AND epoch_start <= ?
        ORDER BY epoch_start DESC LIMIT 1`,
      [network, epochStart],
    )
  }

  return {
    latestEpoch,

    getEpoch(network, epochStart) {
      return epochRow(
        "SELECT * FROM market_epochs WHERE network = ? AND epoch_start = ?",
        [network, epochStart],
      )
    },

    async listGauges(network, epochStart, filter) {
      const where = filterSql(filter)
      const { results } = await db
        .prepare(
          `SELECT gauge FROM market_gauges
            WHERE network = ? AND epoch_start = ? ${where.sql} ${orderByGauge}`,
        )
        .bind(network, epochStart, ...where.bindings)
        .all()
      return results.map((row) => gaugeRowSchema.parse(row))
    },

    async listIncentives(network, epochStart, filter) {
      const where = filterSql(filter)
      const { results } = await db
        .prepare(
          `SELECT incentives FROM market_gauges
            WHERE network = ? AND epoch_start = ? AND has_rewards = 1
            ${where.sql} ${orderByGauge}`,
        )
        .bind(network, epochStart, ...where.bindings)
        .all()
      return results.map((row) => incentivesRowSchema.parse(row))
    },

    getGauge(network, epochStart, gaugeAddress) {
      return storedGauge(
        `SELECT gauge, incentives FROM market_gauges
          WHERE network = ? AND epoch_start = ? AND gauge_address = ?`,
        [network, epochStart, gaugeAddress],
      )
    },

    getGaugeByVebtc(network, epochStart, tokenId) {
      return storedGauge(
        `SELECT gauge, incentives FROM market_gauges
          WHERE network = ? AND epoch_start = ? AND vebtc_token_id = ?
          LIMIT 1`,
        [network, epochStart, tokenId],
      )
    },

    async listGaugeHistory(network, gaugeAddress, maxEpochStart, limit) {
      const { results } = await db
        .prepare(
          `SELECT e.network, e.epoch_start, e.block_number, e.as_of,
                  e.total_weights, e.prices, g.incentives
             FROM market_gauges g
             JOIN market_epochs e
               ON e.network = g.network AND e.epoch_start = g.epoch_start
            WHERE g.network = ? AND g.gauge_address = ? AND g.epoch_start <= ?
            ORDER BY g.epoch_start DESC
            LIMIT ?`,
        )
        .bind(network, gaugeAddress, maxEpochStart, limit)
        .all()
      return results.map((row) => historyRowSchema.parse(row))
    },

    async boostTokens(network, epochStart) {
      const latest = await latestEpoch(network, epochStart)
      if (latest === null) return new Map()
      const { results } = await db
        .prepare(
          `SELECT gauge_address, vebtc_token_id FROM market_gauges
            WHERE network = ? AND epoch_start = ? AND vebtc_token_id IS NOT NULL`,
        )
        .bind(network, latest.epochStart)
        .all()
      return new Map(
        results.map((row) => {
          const parsed = tokenRowSchema.parse(row)
          return [parsed.gauge_address, parsed.vebtc_token_id]
        }),
      )
    },

    async saveSnapshot(snapshot) {
      const summary: SnapshotWriteSummary = {
        epochs: 0,
        written: 0,
        unchanged: 0,
      }
      for (const { epoch, gauges } of snapshot.epochs) {
        const { results } = await db
          .prepare(
            `SELECT gauge_address, hash FROM market_gauges
              WHERE network = ? AND epoch_start = ?`,
          )
          .bind(snapshot.network, epoch.epochStart)
          .all()
        const existing = new Map(
          results.map((row) => {
            const parsed = hashRowSchema.parse(row)
            return [parsed.gauge_address, parsed.hash]
          }),
        )
        const changed: MarketStatement[] = []
        for (const row of gauges) {
          const hash = await storedGaugeHash(row)
          if (existing.get(row.gauge.gaugeAddress) === hash) {
            summary.unchanged += 1
            continue
          }
          changed.push(
            db
              .prepare(
                `INSERT INTO market_gauges (network, epoch_start, gauge_address,
                   voter, vebtc_token_id, has_rewards, gauge, incentives, hash)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (network, epoch_start, gauge_address) DO UPDATE SET
                   voter = excluded.voter,
                   vebtc_token_id = excluded.vebtc_token_id,
                   has_rewards = excluded.has_rewards,
                   gauge = excluded.gauge,
                   incentives = excluded.incentives,
                   hash = excluded.hash`,
              )
              .bind(
                snapshot.network,
                epoch.epochStart,
                row.gauge.gaugeAddress,
                row.gauge.voter,
                vebtcTokenOf(row.gauge),
                row.incentives.rewards.length > 0 ? 1 : 0,
                JSON.stringify(row.gauge),
                JSON.stringify(row.incentives),
                hash,
              ),
          )
        }
        for (const batch of chunk(changed, writeBatchSize)) {
          await db.batch(batch)
        }
        summary.written += changed.length
        // The header moves last, so `asOf` never claims rows not yet written.
        await db
          .prepare(
            `INSERT INTO market_epochs (network, epoch_start, block_number,
               as_of, total_weights, prices)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (network, epoch_start) DO UPDATE SET
               block_number = excluded.block_number,
               as_of = excluded.as_of,
               total_weights = excluded.total_weights,
               prices = excluded.prices`,
          )
          .bind(
            snapshot.network,
            epoch.epochStart,
            epoch.blockNumber,
            epoch.asOf,
            JSON.stringify(epoch.totalWeights),
            JSON.stringify(epoch.prices),
          )
          .run()
        summary.epochs += 1
      }
      return summary
    },
  }
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

type MemoryRow = StoredGauge & { hash: string }

export function createMemoryMarketStore(): MarketStore {
  const epochs = new Map<string, StoredEpoch>()
  const rows = new Map<string, Map<string, MemoryRow>>()

  function epochKey(network: NetworkSlug, epochStart: number): string {
    return `${network}:${epochStart}`
  }

  function rowsOf(network: NetworkSlug, epochStart: number): MemoryRow[] {
    return [...(rows.get(epochKey(network, epochStart))?.values() ?? [])]
  }

  function latestEpoch(
    network: NetworkSlug,
    epochStart: number,
  ): StoredEpoch | null {
    let latest: StoredEpoch | null = null
    for (const epoch of epochs.values()) {
      if (epoch.network !== network || epoch.epochStart > epochStart) continue
      if (latest === null || epoch.epochStart > latest.epochStart) {
        latest = epoch
      }
    }
    return latest
  }

  return {
    async latestEpoch(network, epochStart) {
      return latestEpoch(network, epochStart)
    },

    async getEpoch(network, epochStart) {
      return epochs.get(epochKey(network, epochStart)) ?? null
    },

    async listGauges(network, epochStart, filter) {
      return rowsOf(network, epochStart)
        .map((row) => row.gauge)
        .filter((gauge) => matchesFilter(gauge, filter))
        .sort(compareGauges)
    },

    async listIncentives(network, epochStart, filter) {
      return rowsOf(network, epochStart)
        .map((row) => row.incentives)
        .filter(
          (incentives) =>
            incentives.rewards.length > 0 && matchesFilter(incentives, filter),
        )
        .sort(compareGauges)
    },

    async getGauge(network, epochStart, gaugeAddress) {
      const row = rows.get(epochKey(network, epochStart))?.get(gaugeAddress)
      return row === undefined
        ? null
        : { gauge: row.gauge, incentives: row.incentives }
    },

    async getGaugeByVebtc(network, epochStart, tokenId) {
      const row = rowsOf(network, epochStart).find(
        (candidate) => vebtcTokenOf(candidate.gauge) === tokenId,
      )
      return row === undefined
        ? null
        : { gauge: row.gauge, incentives: row.incentives }
    },

    async listGaugeHistory(network, gaugeAddress, maxEpochStart, limit) {
      return [...epochs.values()]
        .filter(
          (epoch) =>
            epoch.network === network && epoch.epochStart <= maxEpochStart,
        )
        .sort((left, right) => right.epochStart - left.epochStart)
        .flatMap((epoch) => {
          const row = rows
            .get(epochKey(network, epoch.epochStart))
            ?.get(gaugeAddress)
          return row === undefined
            ? []
            : [{ epoch, incentives: row.incentives }]
        })
        .slice(0, limit)
    },

    async boostTokens(network, epochStart) {
      const latest = latestEpoch(network, epochStart)
      const tokens = new Map<string, string>()
      if (latest === null) return tokens
      for (const row of rowsOf(network, latest.epochStart)) {
        const tokenId = vebtcTokenOf(row.gauge)
        if (tokenId !== null) tokens.set(row.gauge.gaugeAddress, tokenId)
      }
      return tokens
    },

    async saveSnapshot(snapshot) {
      const summary: SnapshotWriteSummary = {
        epochs: 0,
        written: 0,
        unchanged: 0,
      }
      for (const { epoch, gauges } of snapshot.epochs) {
        const key = epochKey(snapshot.network, epoch.epochStart)
        const epochRows = rows.get(key) ?? new Map<string, MemoryRow>()
        for (const row of gauges) {
          const hash = await storedGaugeHash(row)
          if (epochRows.get(row.gauge.gaugeAddress)?.hash === hash) {
            summary.unchanged += 1
            continue
          }
          epochRows.set(row.gauge.gaugeAddress, { ...row, hash })
          summary.written += 1
        }
        rows.set(key, epochRows)
        epochs.set(key, epoch)
        summary.epochs += 1
      }
      return summary
    },
  }
}
