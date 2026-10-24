import type { ClientBase } from "pg"
import { type Address, type Hex, isAddress, isHex } from "viem"
import { z } from "zod"
import type { Network } from "../ingest/networks"
import { lower } from "./helpers"
import {
  ACTIVITY_FIELDS,
  type ActivityEventRow,
  type BribeToPoolRow,
  type DynamicDataSource,
  type LockPositionRow,
  type RewardDepositRow,
  type TroveUpdateRow,
  type VoteRow,
} from "./rows"
import type { Store } from "./store"

// Store backed by the projection tables. Handlers are synchronous, so the
// runner prefetches the locks and troves a batch can touch (prefetchLocks,
// prefetchTroves) and the small registries up front (load); writes collect in
// memory and go out in one transaction with the checkpoint (flush).

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

const dataSourceRowSchema = z.union([
  z.object({
    address: addressSchema,
    template: z.enum(["BribeVotingReward", "FeeVotingReward", "Gauge", "Pool"]),
    created_block: z.string().transform(BigInt),
  }),
  z.object({
    address: addressSchema,
    template: z.literal("VoterBribeReward"),
    created_block: z.string().transform(BigInt),
    voter_source: z.enum([
      "BOOST_VOTER",
      "THIRD_PARTY_VOTER",
      "VALIDATORS_VOTER",
    ]),
    gauge: addressSchema,
  }),
])

function dataSourceFromRow(
  network: Network,
  row: z.output<typeof dataSourceRowSchema>,
): DynamicDataSource {
  const base = {
    network,
    address: row.address,
    createdBlock: row.created_block,
  }
  return row.template === "VoterBribeReward"
    ? {
        ...base,
        template: row.template,
        voterSource: row.voter_source,
        gauge: row.gauge,
      }
    : { ...base, template: row.template }
}

const hashSchema = z
  .custom<Hex>((value) => typeof value === "string" && isHex(value))
  .transform((value) => lower(value))
const bigintText = z.string().transform(BigInt)

const troveRowSchema = z.object({
  tx_hash: hashSchema,
  log_index: bigintText,
  block_number: bigintText,
  timestamp: bigintText,
  tx_from: addressSchema,
  contract_address: addressSchema,
  emitter: z.enum(["BORROWER_OPERATIONS", "TROVE_MANAGER"]),
  borrower: addressSchema,
  operation: z.number().int(),
  action: z.enum([
    "LOAN_OPENED",
    "LOAN_REPAID",
    "LOAN_BORROWED",
    "LOAN_COLL_ADDED",
    "LOAN_COLL_WITHDRAWN",
    "LOAN_ADJUSTED",
    "LOAN_REFINANCED",
    "LOAN_CLOSED",
    "LOAN_REWARDS_APPLIED",
    "LOAN_LIQUIDATED",
    "LOAN_REDEEMED",
    "LOAN_UNKNOWN",
  ]),
  principal: bigintText,
  interest: bigintText,
  coll: bigintText,
  stake: bigintText,
  interest_rate: nullableBigint,
  last_interest_update_time: nullableBigint,
  prev_principal: nullableBigint,
  prev_interest: nullableBigint,
  prev_coll: nullableBigint,
  accrued_interest: nullableBigint,
  debt_change: nullableBigint,
  coll_change: nullableBigint,
})

function troveFromRow(row: z.output<typeof troveRowSchema>): TroveUpdateRow {
  return {
    txHash: row.tx_hash,
    logIndex: row.log_index,
    blockNumber: row.block_number,
    timestamp: row.timestamp,
    txFrom: row.tx_from,
    contractAddress: row.contract_address,
    emitter: row.emitter,
    borrower: row.borrower,
    operation: row.operation,
    action: row.action,
    principal: row.principal,
    interest: row.interest,
    coll: row.coll,
    stake: row.stake,
    interestRate: row.interest_rate,
    lastInterestUpdateTime: row.last_interest_update_time,
    prevPrincipal: row.prev_principal,
    prevInterest: row.prev_interest,
    prevColl: row.prev_coll,
    accruedInterest: row.accrued_interest,
    debtChange: row.debt_change,
    collChange: row.coll_change,
  }
}

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
    explorer_parity: row.explorerParity,
  }
  for (const [field, column] of ACTIVITY_FIELDS) {
    json[column] = jsonValue(row[field])
  }
  return json
}

function rewardDepositJson(
  network: Network,
  decoderVersion: number,
  deposit: RewardDepositRow,
) {
  return {
    network,
    tx_hash: deposit.txHash,
    log_index: deposit.logIndex.toString(),
    block_number: deposit.blockNumber.toString(),
    timestamp: deposit.timestamp.toString(),
    tx_from: deposit.txFrom,
    reward_contract: deposit.rewardContract,
    reward_type: deposit.rewardType,
    voter_source: deposit.voterSource,
    gauge: deposit.gauge,
    pool: deposit.pool,
    token: deposit.token,
    epoch_start: deposit.epochStart.toString(),
    amount: deposit.amount.toString(),
    depositor: deposit.depositor,
    decoder_version: decoderVersion,
  }
}

function troveUpdateJson(
  network: Network,
  decoderVersion: number,
  update: TroveUpdateRow,
) {
  return {
    network,
    tx_hash: update.txHash,
    log_index: update.logIndex.toString(),
    block_number: update.blockNumber.toString(),
    timestamp: update.timestamp.toString(),
    tx_from: update.txFrom,
    contract_address: update.contractAddress,
    emitter: update.emitter,
    borrower: update.borrower,
    operation: update.operation,
    action: update.action,
    principal: update.principal.toString(),
    interest: update.interest.toString(),
    coll: update.coll.toString(),
    stake: update.stake.toString(),
    interest_rate: jsonValue(update.interestRate),
    last_interest_update_time: jsonValue(update.lastInterestUpdateTime),
    prev_principal: jsonValue(update.prevPrincipal),
    prev_interest: jsonValue(update.prevInterest),
    prev_coll: jsonValue(update.prevColl),
    accrued_interest: jsonValue(update.accruedInterest),
    debt_change: jsonValue(update.debtChange),
    coll_change: jsonValue(update.collChange),
    decoder_version: decoderVersion,
  }
}

const TROVE_COLUMNS = `tx_hash, log_index::text AS log_index,
  block_number::text AS block_number, timestamp::text AS timestamp, tx_from,
  contract_address, emitter, borrower, operation, action,
  principal::text AS principal, interest::text AS interest, coll::text AS coll,
  stake::text AS stake, interest_rate::text AS interest_rate,
  last_interest_update_time::text AS last_interest_update_time,
  prev_principal::text AS prev_principal, prev_interest::text AS prev_interest,
  prev_coll::text AS prev_coll, accrued_interest::text AS accrued_interest,
  debt_change::text AS debt_change, coll_change::text AS coll_change`

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
  private rewardDeposits: RewardDepositRow[] = []
  // Latest TroveUpdated per borrower; null marks a borrower with none.
  private readonly troves = new Map<Address, TroveUpdateRow | null>()
  private troveUpdates: TroveUpdateRow[] = []

  constructor(
    private readonly network: Network,
    private readonly decoderVersion: number,
  ) {}

  async load(db: ClientBase): Promise<void> {
    const sources = await db.query(
      `SELECT address, template, created_block::text AS created_block,
              voter_source, gauge
       FROM matchbox.projection_data_sources WHERE network = $1`,
      [this.network],
    )
    for (const row of z.array(dataSourceRowSchema).parse(sources.rows)) {
      this.dataSources.set(row.address, dataSourceFromRow(this.network, row))
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

  async prefetchTroves(
    db: ClientBase,
    borrowers: Iterable<Address>,
  ): Promise<void> {
    const missing = [...new Set(borrowers)].filter(
      (borrower) => !this.troves.has(borrower),
    )
    if (missing.length === 0) return
    // Order by the table's bigint columns (t.*): the bare names would bind
    // to the ::text output aliases and sort "9…" after "10…".
    const result = await db.query(
      `SELECT DISTINCT ON (t.borrower) ${TROVE_COLUMNS}
       FROM matchbox.trove_updates AS t
       WHERE t.network = $1 AND t.borrower = ANY($2::text[])
       ORDER BY t.borrower, t.block_number DESC, t.log_index DESC`,
      [this.network, missing],
    )
    for (const borrower of missing) this.troves.set(borrower, null)
    for (const row of z.array(troveRowSchema).parse(result.rows)) {
      this.troves.set(row.borrower, troveFromRow(row))
    }
  }

  getLock(id: string): LockPositionRow | undefined {
    const lock = this.locks.get(id)
    if (lock === undefined) {
      throw new Error(`Lock ${id} was read without being prefetched`)
    }
    return lock === null ? undefined : { ...lock }
  }

  getTrove(borrower: Address): TroveUpdateRow | undefined {
    const trove = this.troves.get(borrower)
    if (trove === undefined) {
      throw new Error(`Trove ${borrower} was read without being prefetched`)
    }
    return trove ?? undefined
  }

  addTroveUpdate(update: TroveUpdateRow): void {
    this.troves.set(update.borrower, update)
    this.troveUpdates.push(update)
  }

  addRewardDeposit(deposit: RewardDepositRow): void {
    this.rewardDeposits.push(deposit)
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
           (network, address, template, created_block, voter_source, gauge)
         SELECT $1, address, template, created_block, voter_source, gauge
         FROM json_to_recordset($2::json)
           AS s(address text, template text, created_block bigint,
                voter_source text, gauge text)
         ON CONFLICT (network, address) DO NOTHING`,
        [
          network,
          JSON.stringify(
            this.newDataSources.map((s) => ({
              address: s.address,
              template: s.template,
              created_block: s.createdBlock.toString(),
              voter_source:
                s.template === "VoterBribeReward" ? s.voterSource : null,
              gauge: s.template === "VoterBribeReward" ? s.gauge : null,
            })),
          ),
        ],
      )
      this.newDataSources.length = 0
    }

    if (this.rewardDeposits.length > 0) {
      await db.query(
        `INSERT INTO matchbox.reward_deposits
         SELECT * FROM json_populate_recordset(
           NULL::matchbox.reward_deposits, $1::json)`,
        [
          JSON.stringify(
            this.rewardDeposits.map((deposit) =>
              rewardDepositJson(network, this.decoderVersion, deposit),
            ),
          ),
        ],
      )
      this.rewardDeposits = []
    }

    if (this.troveUpdates.length > 0) {
      await db.query(
        `INSERT INTO matchbox.trove_updates
         SELECT * FROM json_populate_recordset(
           NULL::matchbox.trove_updates, $1::json)`,
        [
          JSON.stringify(
            this.troveUpdates.map((update) =>
              troveUpdateJson(network, this.decoderVersion, update),
            ),
          ),
        ],
      )
      this.troveUpdates = []
    }
    return written
  }
}
