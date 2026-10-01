import type { ClientBase } from "pg"
import { type Address, isAddress } from "viem"
import { z } from "zod"
import type { Network } from "../types"
import { lower } from "./helpers"
import {
  ACTIVITY_FIELDS,
  type ActivityEventRow,
  type BribeToPoolRow,
  type DynamicDataSource,
  type LockPositionRow,
  type VoteRow,
} from "./rows"
import type { Store } from "./store"

// Store backed by the projection tables. Handlers are synchronous, so the
// runner prefetches the locks a batch can touch (prefetchLocks) and the small
// registries up front (load); writes collect in memory and go out in one
// transaction with the checkpoint (flush).

const addressSchema = z
  .custom<Address>(
    (value) => typeof value === "string" && isAddress(value, { strict: false }),
  )
  .transform((value) => lower(value))

const nullableBigint = z
  .string()
  .nullable()
  .transform((value) => (value === null ? null : BigInt(value)))

const lockRowSchema = z.object({
  id: z.string(),
  token_id: z.string().transform(BigInt),
  contract_address: addressSchema,
  owner: addressSchema.nullable(),
  amount: z.string().transform(BigInt),
  unlock_at: nullableBigint,
  created_at: nullableBigint,
  last_extended_at: nullableBigint,
  withdrawn_at: nullableBigint,
  is_permanent: z.boolean(),
  is_withdrawn: z.boolean(),
  is_merged: z.boolean(),
  merged_into_token_id: nullableBigint,
  merged_at: nullableBigint,
  boost: nullableBigint,
  activity_count: z.string().transform(BigInt),
})

const rewardMappingRowSchema = z.object({
  id: addressSchema,
  pool_address: addressSchema,
  gauge_address: addressSchema,
})

const dataSourceRowSchema = z.object({
  address: addressSchema,
  template: z.enum(["BribeVotingReward", "FeeVotingReward", "Gauge", "Pool"]),
  created_block: z.string().transform(BigInt),
})

type JsonValue = string | boolean | null

function jsonValue(value: bigint | string | boolean | null): JsonValue {
  return typeof value === "bigint" ? value.toString() : value
}

function activityJson(
  network: Network,
  decoderVersion: number,
  row: ActivityEventRow,
): Record<string, JsonValue | number> {
  const json: Record<string, JsonValue | number> = {
    network,
    decoder_version: decoderVersion,
  }
  for (const [field, column] of ACTIVITY_FIELDS) {
    json[column] = jsonValue(row[field])
  }
  return json
}

function lockJson(network: Network, lock: LockPositionRow) {
  return {
    network,
    id: lock.id,
    token_id: lock.tokenId.toString(),
    contract_address: lock.contractAddress,
    owner: lock.owner,
    amount: lock.amount.toString(),
    unlock_at: jsonValue(lock.unlockAt),
    created_at: jsonValue(lock.createdAt),
    last_extended_at: jsonValue(lock.lastExtendedAt),
    withdrawn_at: jsonValue(lock.withdrawnAt),
    is_permanent: lock.isPermanent,
    is_withdrawn: lock.isWithdrawn,
    is_merged: lock.isMerged,
    merged_into_token_id: jsonValue(lock.mergedIntoTokenId),
    merged_at: jsonValue(lock.mergedAt),
    boost: jsonValue(lock.boost),
    activity_count: lock.activityCount.toString(),
  }
}

function voteJson(network: Network, vote: VoteRow) {
  return {
    network,
    id: vote.id,
    voter_contract: vote.voterContract,
    token_id: vote.tokenId.toString(),
    gauge: vote.gauge,
    owner: vote.owner,
    current_weight: vote.currentWeight.toString(),
    last_updated_epoch: vote.lastUpdatedEpoch.toString(),
    last_updated_at: vote.lastUpdatedAt.toString(),
    is_active: vote.isActive,
  }
}

export class PgStore implements Store {
  // null marks a lock known not to exist, so a miss is never ambiguous.
  private readonly locks = new Map<string, LockPositionRow | null>()
  private readonly dirtyLocks = new Set<string>()
  private readonly rewardMappings = new Map<Address, BribeToPoolRow>()
  private readonly newRewardMappings: BribeToPoolRow[] = []
  private readonly dataSources = new Map<Address, DynamicDataSource>()
  private readonly newDataSources: DynamicDataSource[] = []
  private readonly votes = new Map<string, VoteRow>()
  private activities: ActivityEventRow[] = []

  constructor(
    private readonly network: Network,
    private readonly decoderVersion: number,
  ) {}

  async load(db: ClientBase): Promise<void> {
    const sources = await db.query(
      `SELECT address, template, created_block::text AS created_block
       FROM matchbox.projection_data_sources WHERE network = $1`,
      [this.network],
    )
    for (const row of z.array(dataSourceRowSchema).parse(sources.rows)) {
      this.dataSources.set(row.address, {
        network: this.network,
        address: row.address,
        template: row.template,
        createdBlock: row.created_block,
      })
    }
    const mappings = await db.query(
      `SELECT id, pool_address, gauge_address
       FROM matchbox.bribe_to_pool WHERE network = $1`,
      [this.network],
    )
    for (const row of z.array(rewardMappingRowSchema).parse(mappings.rows)) {
      this.rewardMappings.set(row.id, {
        id: row.id,
        poolAddress: row.pool_address,
        gaugeAddress: row.gauge_address,
      })
    }
  }

  async prefetchLocks(db: ClientBase, ids: Iterable<string>): Promise<void> {
    const missing = [...new Set(ids)].filter((id) => !this.locks.has(id))
    if (missing.length === 0) return
    const result = await db.query(
      `SELECT id, token_id::text AS token_id, contract_address, owner,
              amount::text AS amount, unlock_at::text AS unlock_at,
              created_at::text AS created_at,
              last_extended_at::text AS last_extended_at,
              withdrawn_at::text AS withdrawn_at, is_permanent, is_withdrawn,
              is_merged, merged_into_token_id::text AS merged_into_token_id,
              merged_at::text AS merged_at, boost::text AS boost,
              activity_count::text AS activity_count
       FROM matchbox.lock_positions
       WHERE network = $1 AND id = ANY($2::text[])`,
      [this.network, missing],
    )
    for (const id of missing) this.locks.set(id, null)
    for (const row of z.array(lockRowSchema).parse(result.rows)) {
      this.locks.set(row.id, {
        id: row.id,
        tokenId: row.token_id,
        contractAddress: row.contract_address,
        owner: row.owner,
        amount: row.amount,
        unlockAt: row.unlock_at,
        createdAt: row.created_at,
        lastExtendedAt: row.last_extended_at,
        withdrawnAt: row.withdrawn_at,
        isPermanent: row.is_permanent,
        isWithdrawn: row.is_withdrawn,
        isMerged: row.is_merged,
        mergedIntoTokenId: row.merged_into_token_id,
        mergedAt: row.merged_at,
        boost: row.boost,
        activityCount: row.activity_count,
      })
    }
  }

  getLock(id: string): LockPositionRow | undefined {
    const lock = this.locks.get(id)
    if (lock === undefined) {
      throw new Error(`Lock ${id} was read without being prefetched`)
    }
    return lock === null ? undefined : { ...lock }
  }

  putLock(lock: LockPositionRow): void {
    this.locks.set(lock.id, { ...lock })
    this.dirtyLocks.add(lock.id)
  }

  getRewardMapping(rewardContract: Address): BribeToPoolRow | undefined {
    return this.rewardMappings.get(rewardContract)
  }

  putRewardMapping(mapping: BribeToPoolRow): void {
    if (this.rewardMappings.has(mapping.id)) return
    this.rewardMappings.set(mapping.id, mapping)
    this.newRewardMappings.push(mapping)
  }

  putVote(vote: VoteRow): void {
    this.votes.set(vote.id, { ...vote })
  }

  getDataSource(address: Address): DynamicDataSource | undefined {
    return this.dataSources.get(address)
  }

  putDataSource(source: DynamicDataSource): void {
    if (this.dataSources.has(source.address)) return
    this.dataSources.set(source.address, source)
    this.newDataSources.push(source)
  }

  addActivity(activity: ActivityEventRow): void {
    this.activities.push(activity)
  }

  pendingActivityCount(): number {
    return this.activities.length
  }

  // Writes everything collected since the last flush plus the projection
  // checkpoint, atomically. The caller owns BEGIN/COMMIT.
  async flush(db: ClientBase): Promise<number> {
    const network = this.network
    const written = this.activities.length
    if (this.activities.length > 0) {
      await db.query(
        `INSERT INTO matchbox.activity_events
         SELECT * FROM json_populate_recordset(
           NULL::matchbox.activity_events, $1::json)`,
        [
          JSON.stringify(
            this.activities.map((row) =>
              activityJson(network, this.decoderVersion, row),
            ),
          ),
        ],
      )
      this.activities = []
    }

    if (this.dirtyLocks.size > 0) {
      const rows = [...this.dirtyLocks].flatMap((id) => {
        const lock = this.locks.get(id)
        return lock ? [lockJson(network, lock)] : []
      })
      await db.query(
        `INSERT INTO matchbox.lock_positions
         SELECT * FROM json_populate_recordset(
           NULL::matchbox.lock_positions, $1::json)
         ON CONFLICT (network, id) DO UPDATE SET
           owner = EXCLUDED.owner,
           amount = EXCLUDED.amount,
           unlock_at = EXCLUDED.unlock_at,
           created_at = EXCLUDED.created_at,
           last_extended_at = EXCLUDED.last_extended_at,
           withdrawn_at = EXCLUDED.withdrawn_at,
           is_permanent = EXCLUDED.is_permanent,
           is_withdrawn = EXCLUDED.is_withdrawn,
           is_merged = EXCLUDED.is_merged,
           merged_into_token_id = EXCLUDED.merged_into_token_id,
           merged_at = EXCLUDED.merged_at,
           boost = EXCLUDED.boost,
           activity_count = EXCLUDED.activity_count`,
        [JSON.stringify(rows)],
      )
      this.dirtyLocks.clear()
    }

    if (this.votes.size > 0) {
      await db.query(
        `INSERT INTO matchbox.votes
         SELECT * FROM json_populate_recordset(NULL::matchbox.votes, $1::json)
         ON CONFLICT (network, id) DO UPDATE SET
           owner = EXCLUDED.owner,
           current_weight = EXCLUDED.current_weight,
           last_updated_epoch = EXCLUDED.last_updated_epoch,
           last_updated_at = EXCLUDED.last_updated_at,
           is_active = EXCLUDED.is_active`,
        [
          JSON.stringify(
            [...this.votes.values()].map((v) => voteJson(network, v)),
          ),
        ],
      )
      this.votes.clear()
    }

    if (this.newRewardMappings.length > 0) {
      await db.query(
        `INSERT INTO matchbox.bribe_to_pool (network, id, pool_address, gauge_address)
         SELECT $1, id, pool_address, gauge_address
         FROM json_to_recordset($2::json)
           AS m(id text, pool_address text, gauge_address text)
         ON CONFLICT (network, id) DO NOTHING`,
        [
          network,
          JSON.stringify(
            this.newRewardMappings.map((m) => ({
              id: m.id,
              pool_address: m.poolAddress,
              gauge_address: m.gaugeAddress,
            })),
          ),
        ],
      )
      this.newRewardMappings.length = 0
    }

    if (this.newDataSources.length > 0) {
      await db.query(
        `INSERT INTO matchbox.projection_data_sources
           (network, address, template, created_block)
         SELECT $1, address, template, created_block
         FROM json_to_recordset($2::json)
           AS s(address text, template text, created_block bigint)
         ON CONFLICT (network, address) DO NOTHING`,
        [
          network,
          JSON.stringify(
            this.newDataSources.map((s) => ({
              address: s.address,
              template: s.template,
              created_block: s.createdBlock.toString(),
            })),
          ),
        ],
      )
      this.newDataSources.length = 0
    }
    return written
  }
}
