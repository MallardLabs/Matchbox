import {
  type Address,
  type Hex,
  decodeEventLog,
  parseAbiItem,
  toEventSelector,
} from "viem"
import type { RawLog, RegisteredContract } from "../types"

// The only events that spawn child data sources in the explorer subgraph:
// PoolsVoter.GaugeCreated (gauge + bribe/fee reward templates) and
// PoolFactory.PoolCreated (pool template). BoostVoter, ThirdPartyVoter and
// ValidatorsVoter gauges emit nothing the explorer indexes.
const POOL_GAUGE_CREATED = parseAbiItem(
  "event GaugeCreated(address indexed poolFactory, address indexed votingRewardsFactory, address indexed gaugeFactory, address pool, address bribeVotingReward, address feeVotingReward, address gauge, address creator)",
)
// The ABI leaves the uint256 unnamed; naming it keeps the selector and makes
// viem decode named args.
const POOL_CREATED = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, bool indexed stable, address pool, uint256 poolCount)",
)

export const POOL_GAUGE_CREATED_TOPIC = toEventSelector(POOL_GAUGE_CREATED)
export const POOL_CREATED_TOPIC = toEventSelector(POOL_CREATED)
export const FACTORY_TOPICS: Hex[] = [
  POOL_GAUGE_CREATED_TOPIC,
  POOL_CREATED_TOPIC,
]

function lower(address: Address): Address {
  return address.toLowerCase() as Address
}

export type PoolLink = {
  network: RawLog["network"]
  pool: Address
  gauge: Address
}

export type Discovery = {
  children: RegisteredContract[]
  // A GaugeCreated names its pool. Only an already-registered pool gets the
  // link: pools from other factories (e.g. CL) were never explorer templates.
  poolLinks: PoolLink[]
}

const NOTHING: Discovery = { children: [], poolLinks: [] }

// Child contracts registered by a factory log. Empty for any other log.
export function discoverFromLog(
  log: RawLog,
  factories: ReadonlyMap<Address, RegisteredContract>,
): Discovery {
  const factory = factories.get(log.address)
  const topic0 = log.topics[0]
  if (!factory || !topic0) return NOTHING

  const base = {
    network: log.network,
    parent: log.address,
    createdBlock: log.blockNumber,
    createdTx: log.txHash,
  }

  if (factory.kind === "poolsVoter" && topic0 === POOL_GAUGE_CREATED_TOPIC) {
    const { args } = decodeEventLog({
      abi: [POOL_GAUGE_CREATED],
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
    })
    const pool = lower(args.pool)
    const gauge = lower(args.gauge)
    const children: RegisteredContract[] = [
      {
        ...base,
        address: gauge,
        kind: "gauge",
        template: "Gauge",
        pool,
        gauge,
      },
      {
        ...base,
        address: lower(args.bribeVotingReward),
        kind: "bribeVotingReward",
        template: "BribeVotingReward",
        pool,
        gauge,
      },
      {
        ...base,
        address: lower(args.feeVotingReward),
        kind: "feeVotingReward",
        template: "FeeVotingReward",
        pool,
        gauge,
      },
    ]
    return { children, poolLinks: [{ network: log.network, pool, gauge }] }
  }

  if (factory.kind === "poolFactory" && topic0 === POOL_CREATED_TOPIC) {
    const { args } = decodeEventLog({
      abi: [POOL_CREATED],
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
    })
    const pool = lower(args.pool)
    return {
      children: [
        {
          ...base,
          address: pool,
          kind: "pool",
          template: "Pool",
          pool,
          gauge: null,
        },
      ],
      poolLinks: [],
    }
  }

  return NOTHING
}

export function factoryContracts(
  contracts: Iterable<RegisteredContract>,
): Map<Address, RegisteredContract> {
  const factories = new Map<Address, RegisteredContract>()
  for (const contract of contracts) {
    if (contract.kind === "poolsVoter" || contract.kind === "poolFactory") {
      factories.set(contract.address, contract)
    }
  }
  return factories
}

// Merges a registry entry the way matchbox.contracts upserts do: the first
// writer keeps kind/template, later writers only fill gaps.
export function mergeContract(
  existing: RegisteredContract | undefined,
  incoming: RegisteredContract,
): RegisteredContract {
  if (!existing) return incoming
  return {
    ...existing,
    parent: existing.parent ?? incoming.parent,
    pool: existing.pool ?? incoming.pool,
    gauge: existing.gauge ?? incoming.gauge,
    createdBlock:
      incoming.createdBlock < existing.createdBlock
        ? incoming.createdBlock
        : existing.createdBlock,
    createdTx: existing.createdTx ?? incoming.createdTx,
  }
}
