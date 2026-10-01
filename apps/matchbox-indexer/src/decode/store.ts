import type { Address } from "viem"
import type {
  ActivityEventRow,
  BribeToPoolRow,
  DynamicDataSource,
  LockPositionRow,
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
}

export class InMemoryStore implements Store {
  readonly locks = new Map<string, LockPositionRow>()
  readonly rewardMappings = new Map<Address, BribeToPoolRow>()
  readonly votes = new Map<string, VoteRow>()
  readonly dataSources = new Map<Address, DynamicDataSource>()
  readonly activities = new Map<string, ActivityEventRow>()

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
}
