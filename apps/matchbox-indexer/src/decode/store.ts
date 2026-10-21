import type { Address } from "viem"
import type {
  ActivityEventRow,
  BribeToPoolRow,
  DynamicDataSource,
  LockPositionRow,
  RewardDepositRow,
  TroveUpdateRow,
  VoteRow,
} from "./rows"

// Handlers run synchronously against this interface. The Postgres store
// prefetches what a batch needs before handlers run and flushes after, so
// handlers never wait on the network. Writes are visible to later handlers
// in the same run, matching graph-node's in-block entity cache.
export type Store = {
  getLock(id: string): LockPositionRow | undefined
  putLock(lock: LockPositionRow): void
  getRewardMapping(rewardContract: Address): BribeToPoolRow | undefined
  putRewardMapping(mapping: BribeToPoolRow): void
  putVote(vote: VoteRow): void
  getDataSource(address: Address): DynamicDataSource | undefined
  putDataSource(source: DynamicDataSource): void
  addActivity(activity: ActivityEventRow): void
  addRewardDeposit(deposit: RewardDepositRow): void
  // The borrower's latest TroveUpdated, if any.
  getTrove(borrower: Address): TroveUpdateRow | undefined
  addTroveUpdate(update: TroveUpdateRow): void
}

export class InMemoryStore implements Store {
  readonly locks = new Map<string, LockPositionRow>()
  readonly rewardMappings = new Map<Address, BribeToPoolRow>()
  readonly votes = new Map<string, VoteRow>()
  readonly dataSources = new Map<Address, DynamicDataSource>()
  readonly activities = new Map<string, ActivityEventRow>()
  readonly rewardDeposits: RewardDepositRow[] = []
  readonly troveUpdates: TroveUpdateRow[] = []
  private readonly troves = new Map<Address, TroveUpdateRow>()

  getLock(id: string): LockPositionRow | undefined {
    const lock = this.locks.get(id)
    return lock === undefined ? undefined : { ...lock }
  }

  putLock(lock: LockPositionRow): void {
    this.locks.set(lock.id, { ...lock })
  }

  getRewardMapping(rewardContract: Address): BribeToPoolRow | undefined {
    return this.rewardMappings.get(rewardContract)
  }

  putRewardMapping(mapping: BribeToPoolRow): void {
    this.rewardMappings.set(mapping.id, { ...mapping })
  }

  putVote(vote: VoteRow): void {
    this.votes.set(vote.id, { ...vote })
  }

  getDataSource(address: Address): DynamicDataSource | undefined {
    return this.dataSources.get(address)
  }

  putDataSource(source: DynamicDataSource): void {
    if (!this.dataSources.has(source.address)) {
      this.dataSources.set(source.address, { ...source })
    }
  }

  addActivity(activity: ActivityEventRow): void {
    if (this.activities.has(activity.id)) {
      throw new Error(`Duplicate activity id ${activity.id}`)
    }
    this.activities.set(activity.id, activity)
  }

  addRewardDeposit(deposit: RewardDepositRow): void {
    this.rewardDeposits.push(deposit)
  }

  getTrove(borrower: Address): TroveUpdateRow | undefined {
    return this.troves.get(borrower)
  }

  addTroveUpdate(update: TroveUpdateRow): void {
    this.troveUpdates.push(update)
    this.troves.set(update.borrower, update)
  }
}

// What a handler sees for a log matchbox-explorer 3.4.0 would not have
// handled: the same store, with every activity row it adds marked
// warehouse-only.
export class WarehouseOnlyStore implements Store {
  constructor(private readonly inner: Store) {}

  getLock(id: string): LockPositionRow | undefined {
    return this.inner.getLock(id)
  }

  putLock(lock: LockPositionRow): void {
    this.inner.putLock(lock)
  }

  getRewardMapping(rewardContract: Address): BribeToPoolRow | undefined {
    return this.inner.getRewardMapping(rewardContract)
  }

  putRewardMapping(mapping: BribeToPoolRow): void {
    this.inner.putRewardMapping(mapping)
  }

  putVote(vote: VoteRow): void {
    this.inner.putVote(vote)
  }

  getDataSource(address: Address): DynamicDataSource | undefined {
    return this.inner.getDataSource(address)
  }

  putDataSource(source: DynamicDataSource): void {
    this.inner.putDataSource(source)
  }

  addActivity(activity: ActivityEventRow): void {
    this.inner.addActivity({ ...activity, explorerParity: false })
  }

  addRewardDeposit(deposit: RewardDepositRow): void {
    this.inner.addRewardDeposit(deposit)
  }

  getTrove(borrower: Address): TroveUpdateRow | undefined {
    return this.inner.getTrove(borrower)
  }

  addTroveUpdate(update: TroveUpdateRow): void {
    this.inner.addTroveUpdate(update)
  }
}
