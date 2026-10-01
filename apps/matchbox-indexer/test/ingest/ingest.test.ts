import { type Address, pad } from "viem"
import { describe, expect, it } from "vitest"
import {
  type IngestDeps,
  blockWindows,
  ingestRange,
  ingestToHead,
} from "../../src/ingest/ingest"
import type { NetworkConfig } from "../../src/ingest/networks"
import { RpcClient } from "../../src/ingest/rpc"
import { MemoryIngestStore, nextCheckpoint } from "../../src/ingest/store"
import type { RegisteredContract } from "../../src/types"
import {
  type ChainLog,
  FakeChain,
  eventLog,
  poolCreatedLog,
  poolGaugeCreatedLog,
} from "./fake-chain"

const address = (n: number): Address => pad(`0x${n.toString(16)}`, { size: 20 })

const VOTER = address(0x100)
const FACTORY = address(0x200)
const POOL = address(0x300)
const GAUGE = address(0x400)
const BRIBE = address(0x500)
const FEE = address(0x600)
const OTHER_POOL = address(0x700)
const OTHER_GAUGE = address(0x800)

const CONFIG: NetworkConfig = {
  network: "mezo",
  chainId: 31612,
  startBlock: 1n,
  confirmations: 2n,
  windowSize: 10n,
  endpoints: [
    { url: "https://rpc.test", maxAddresses: 100, maxBlockRange: 10 },
  ],
}

function staticContract(
  contract: Pick<RegisteredContract, "address" | "kind" | "template">,
): RegisteredContract {
  return {
    network: "mezo",
    parent: null,
    pool: null,
    gauge: null,
    createdBlock: 1n,
    createdTx: null,
    ...contract,
  }
}

const STATICS = [
  staticContract({
    address: VOTER,
    kind: "poolsVoter",
    template: "PoolsVoter",
  }),
  staticContract({
    address: FACTORY,
    kind: "poolFactory",
    template: "PoolFactory",
  }),
]

function setup(logs: ChainLog[], head = 100) {
  const chain = new FakeChain({ head, logs })
  const store = new MemoryIngestStore()
  const deps: IngestDeps = {
    config: CONFIG,
    store,
    staticContracts: STATICS,
    rpc: new RpcClient({
      network: "mezo",
      endpoints: CONFIG.endpoints,
      fetch: chain.fetch,
      sleep: async () => {},
    }),
  }
  return { chain, store, deps }
}

// Pool created at 12, its gauge at 14, first gauge deposit at 16: all inside
// the 11-20 window. A Sync on the pool is not a handled event.
const CHAIN: ChainLog[] = [
  poolCreatedLog({ block: 12, logIndex: 0, factory: FACTORY, pool: POOL }),
  poolGaugeCreatedLog({
    block: 14,
    logIndex: 0,
    voter: VOTER,
    pool: POOL,
    bribe: BRIBE,
    fee: FEE,
    gauge: GAUGE,
  }),
  eventLog({
    block: 16,
    logIndex: 0,
    address: GAUGE,
    signature: "Deposit(address,address,uint256)",
  }),
  eventLog({
    block: 17,
    logIndex: 0,
    address: POOL,
    signature: "Swap(address,address,uint256,uint256,uint256,uint256)",
  }),
  eventLog({
    block: 17,
    logIndex: 1,
    address: POOL,
    signature: "Sync(uint256,uint256)",
  }),
  eventLog({
    block: 25,
    logIndex: 0,
    address: BRIBE,
    signature: "ClaimRewards(address,address,uint256)",
  }),
]

describe("blockWindows", () => {
  it("covers an inclusive range without gaps or overlap", () => {
    expect(blockWindows(1n, 25n, 10n)).toEqual([
      { from: 1n, to: 10n },
      { from: 11n, to: 20n },
      { from: 21n, to: 25n },
    ])
    expect(blockWindows(5n, 5n, 10n)).toEqual([{ from: 5n, to: 5n }])
    expect(blockWindows(6n, 5n, 10n)).toEqual([])
  })
})

describe("ingestRange", () => {
  it("catches a child's first logs in the window that created it", async () => {
    const { store, deps } = setup(CHAIN)
    const summary = await ingestRange(deps, { from: 11n, to: 20n })

    const stored = [...store.logs.values()].map((log) => [
      log.address,
      log.blockNumber,
    ])
    expect(stored).toContainEqual([GAUGE, 16n])
    expect(stored).toContainEqual([POOL, 17n])
    expect(summary.windows).toBe(1)
    const contracts = await store.loadContracts("mezo")
    expect(contracts.map((contract) => contract.address).sort()).toEqual(
      [VOTER, FACTORY, POOL, GAUGE, BRIBE, FEE].sort(),
    )
  })

  it("stores only handled topics", async () => {
    const { store, deps } = setup(CHAIN)
    await ingestRange(deps, { from: 11n, to: 20n })

    const poolLogs = [...store.logs.values()].filter(
      (log) => log.address === POOL,
    )
    expect(poolLogs).toHaveLength(1)
    expect(poolLogs[0]?.logIndex).toBe(0)
  })

  it("links a registered pool to its gauge and records child provenance", async () => {
    const { store, deps } = setup(CHAIN)
    await ingestRange(deps, { from: 11n, to: 20n })

    const byAddress = new Map(
      (await store.loadContracts("mezo")).map((contract) => [
        contract.address,
        contract,
      ]),
    )
    expect(byAddress.get(POOL)?.gauge).toBe(GAUGE)
    expect(byAddress.get(BRIBE)).toMatchObject({
      kind: "bribeVotingReward",
      template: "BribeVotingReward",
      parent: VOTER,
      pool: POOL,
      gauge: GAUGE,
      createdBlock: 14n,
    })
  })

  it("does not register a pool it only learns of from GaugeCreated", async () => {
    const { store, deps } = setup([
      poolGaugeCreatedLog({
        block: 3,
        logIndex: 0,
        voter: VOTER,
        pool: OTHER_POOL,
        bribe: address(0x901),
        fee: address(0x902),
        gauge: OTHER_GAUGE,
      }),
    ])
    await ingestRange(deps, { from: 1n, to: 10n })

    const addresses = (await store.loadContracts("mezo")).map(
      (contract) => contract.address,
    )
    expect(addresses).toContain(OTHER_GAUGE)
    expect(addresses).not.toContain(OTHER_POOL)
  })

  it("is idempotent and never moves the checkpoint backwards", async () => {
    const { store, deps } = setup(CHAIN)
    await ingestRange(deps, { from: 1n, to: 30n })
    const logs = store.logs.size
    const transactions = store.transactions.size
    const contracts = store.contracts.size

    await ingestRange(deps, { from: 1n, to: 30n })
    await ingestRange(deps, { from: 11n, to: 20n })

    expect(store.logs.size).toBe(logs)
    expect(store.transactions.size).toBe(transactions)
    expect(store.contracts.size).toBe(contracts)
    expect(await store.getCheckpoint("mezo", "logs")).toBe(30n)
  })

  it("does not refetch transactions it already stored", async () => {
    const { chain, deps } = setup(CHAIN)
    await ingestRange(deps, { from: 1n, to: 30n })
    const before = chain.callsTo("eth_getTransactionByHash").length

    await ingestRange(deps, { from: 1n, to: 30n })

    expect(chain.callsTo("eth_getTransactionByHash").length).toBe(before)
  })

  it("gives parallel windows a complete address set after discovery", async () => {
    const { store, deps } = setup(CHAIN)
    await ingestRange(deps, {
      from: 1n,
      to: 30n,
      concurrency: 3,
      discoverFirst: true,
    })

    const stored = [...store.logs.values()]
    expect(
      stored.some((log) => log.address === BRIBE && log.blockNumber === 25n),
    ).toBe(true)
    expect(
      stored.some((log) => log.address === GAUGE && log.blockNumber === 16n),
    ).toBe(true)
    expect(await store.getCheckpoint("mezo", "logs")).toBe(30n)
  })

  it("commits each window with its transactions and positive timestamps", async () => {
    const { store, deps } = setup(CHAIN)
    await ingestRange(deps, { from: 1n, to: 30n })

    for (const log of store.logs.values()) {
      expect(log.blockTimestamp > 0n).toBe(true)
      expect(store.transactions.has(`mezo:${log.txHash}`)).toBe(true)
    }
    expect(store.commits).toBe(3)
  })
})

describe("transaction persistence", () => {
  it("keeps only the calldata selector", async () => {
    const { store, deps } = setup(CHAIN)
    await ingestRange(deps, { from: 1n, to: 30n })

    const transactions = [...store.transactions.values()]
    expect(new Set(transactions.map((tx) => tx.input))).toEqual(
      new Set(["0xd3672ab2"]),
    )
    expect(transactions.every((tx) => tx.from.length === 42)).toBe(true)
  })
})

describe("checkpoint", () => {
  it("only covers a contiguous prefix from the start block", () => {
    const window = (fromBlock: bigint, toBlock: bigint) => ({
      fromBlock,
      toBlock,
      startBlock: 1n,
    })
    expect(nextCheckpoint(null, window(1n, 10n))).toBe(10n)
    expect(nextCheckpoint(null, window(11n, 20n))).toBeNull()
    expect(nextCheckpoint(10n, window(11n, 20n))).toBe(20n)
    expect(nextCheckpoint(10n, window(21n, 30n))).toBe(10n)
    expect(nextCheckpoint(30n, window(11n, 20n))).toBe(30n)
  })

  it("is not advanced past a gap by an out-of-order range", async () => {
    const { store, deps } = setup(CHAIN)
    await ingestRange(deps, { from: 11n, to: 20n })
    expect(await store.getCheckpoint("mezo", "logs")).toBeNull()

    await ingestRange(deps, { from: 1n, to: 10n })
    expect(await store.getCheckpoint("mezo", "logs")).toBe(10n)

    await ingestRange(deps, { from: 21n, to: 30n })
    expect(await store.getCheckpoint("mezo", "logs")).toBe(10n)

    await ingestRange(deps, { from: 11n, to: 30n })
    expect(await store.getCheckpoint("mezo", "logs")).toBe(30n)
  })
})

describe("ingestToHead", () => {
  it("stays confirmations behind head and resumes from the checkpoint", async () => {
    const { store, deps } = setup(CHAIN, 32)
    const first = await ingestToHead(deps, 15n)
    expect(first).toMatchObject({ from: 1n, to: 15n })

    const second = await ingestToHead(deps, 100n)
    expect(second).toMatchObject({ from: 16n, to: 30n })
    expect(await store.getCheckpoint("mezo", "logs")).toBe(30n)

    expect(await ingestToHead(deps, 100n)).toBeNull()
  })
})
