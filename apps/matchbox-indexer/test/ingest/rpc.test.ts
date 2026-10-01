import { type Address, pad } from "viem"
import { describe, expect, it } from "vitest"
import { RpcClient } from "../../src/ingest/rpc"
import {
  FakeChain,
  TX_INPUT,
  blockHash,
  blockTimestamp,
  eventLog,
} from "./fake-chain"

const PRIMARY = "https://primary.test"
const FALLBACK = "https://fallback.test"

function addresses(count: number): Address[] {
  return Array.from({ length: count }, (_, index) =>
    pad(`0x${(index + 1).toString(16)}`, { size: 20 }),
  )
}

function client(chain: FakeChain, maxAddresses = 100) {
  return new RpcClient({
    network: "mezo",
    fetch: chain.fetch,
    sleep: async () => {},
    endpoints: [
      { url: PRIMARY, maxAddresses, maxBlockRange: 10 },
      { url: FALLBACK, maxAddresses: 100, maxBlockRange: 10 },
    ],
  })
}

describe("RpcClient.getLogs", () => {
  it("chunks addresses to the endpoint limit", async () => {
    const watched = addresses(5)
    const chain = new FakeChain({
      head: 100,
      logs: watched.map((address, index) =>
        eventLog({ block: 3, logIndex: index, address, signature: "Foo()" }),
      ),
    })
    const logs = await client(chain, 2).getLogs(1n, 10n, watched)

    expect(logs).toHaveLength(5)
    expect(chain.callsTo("eth_getLogs")).toHaveLength(3)
  })

  it("takes timestamps from block headers, never the log's 0x0", async () => {
    const [address] = addresses(1) as [Address]
    const chain = new FakeChain({
      head: 100,
      logs: [
        eventLog({ block: 4, logIndex: 0, address, signature: "Foo()" }),
        eventLog({ block: 4, logIndex: 1, address, signature: "Foo()" }),
        eventLog({ block: 7, logIndex: 0, address, signature: "Foo()" }),
      ],
    })
    const logs = await client(chain).getLogs(1n, 10n, [address])

    expect(logs.map((log) => log.blockTimestamp)).toEqual([
      blockTimestamp(4),
      blockTimestamp(4),
      blockTimestamp(7),
    ])
    expect(logs.every((log) => log.blockTimestamp > 0n)).toBe(true)
    // One batched header request covers both blocks.
    expect(chain.callsTo("eth_getBlockByNumber")).toHaveLength(2)
  })

  it("fails when a header hash disagrees with the log", async () => {
    const [address] = addresses(1) as [Address]
    const chain = new FakeChain({
      head: 100,
      logs: [eventLog({ block: 4, logIndex: 0, address, signature: "Foo()" })],
      headerOverrides: new Map([[4, { hash: blockHash(99) }]]),
    })

    await expect(client(chain).getLogs(1n, 10n, [address])).rejects.toThrow(
      /hash mismatch/,
    )
  })

  it("fails on a zero header timestamp", async () => {
    const [address] = addresses(1) as [Address]
    const chain = new FakeChain({
      head: 100,
      logs: [eventLog({ block: 4, logIndex: 0, address, signature: "Foo()" })],
      headerOverrides: new Map([[4, { timestamp: 0n }]]),
    })

    await expect(client(chain).getLogs(1n, 10n, [address])).rejects.toThrow(
      /timestamp 0/,
    )
  })

  it("filters by topic0", async () => {
    const [address] = addresses(1) as [Address]
    const chain = new FakeChain({
      head: 100,
      logs: [
        eventLog({ block: 2, logIndex: 0, address, signature: "Swap()" }),
        eventLog({ block: 2, logIndex: 1, address, signature: "Sync()" }),
      ],
    })
    const swap = eventLog({
      block: 2,
      logIndex: 0,
      address,
      signature: "Swap()",
    })
    const logs = await client(chain).getLogs(
      1n,
      10n,
      [address],
      [swap.topics[0] as `0x${string}`],
    )

    expect(logs).toHaveLength(1)
    expect(logs[0]?.logIndex).toBe(0)
  })
})

describe("RpcClient.getLogsForFilters", () => {
  it("fetches each block header once across filters", async () => {
    const [first, second] = addresses(2) as [Address, Address]
    const chain = new FakeChain({
      head: 100,
      logs: [
        eventLog({ block: 5, logIndex: 0, address: first, signature: "Foo()" }),
        eventLog({
          block: 5,
          logIndex: 1,
          address: second,
          signature: "Bar()",
        }),
      ],
    })
    const logs = await client(chain).getLogsForFilters(1n, 10n, [
      { addresses: [first] },
      { addresses: [second] },
      { addresses: [] },
    ])

    expect(logs.map((log) => log.logIndex)).toEqual([0, 1])
    expect(chain.callsTo("eth_getLogs")).toHaveLength(2)
    expect(chain.callsTo("eth_getBlockByNumber")).toHaveLength(1)
  })
})

describe("RpcClient failover", () => {
  it("retries a rate-limited endpoint, then moves to the next", async () => {
    const [address] = addresses(1) as [Address]
    const chain = new FakeChain({
      head: 100,
      logs: [eventLog({ block: 2, logIndex: 0, address, signature: "Foo()" })],
    })
    chain.failNext(PRIMARY, 429, 429, 429)
    const logs = await client(chain).getLogs(1n, 10n, [address])

    expect(logs).toHaveLength(1)
    expect(chain.callsTo("eth_getLogs")[0]?.url).toBe(FALLBACK)
  })

  it("recovers on the same endpoint after a transient 503", async () => {
    const chain = new FakeChain({ head: 123, logs: [] })
    chain.failNext(PRIMARY, 503)

    expect(await client(chain).blockNumber()).toBe(123n)
    expect(chain.callsTo("eth_blockNumber")[0]?.url).toBe(PRIMARY)
  })

  it("splits a range no endpoint will serve", async () => {
    const [address] = addresses(1) as [Address]
    const chain = new FakeChain({
      head: 100,
      logs: [
        eventLog({ block: 2, logIndex: 0, address, signature: "Foo()" }),
        eventLog({ block: 18, logIndex: 0, address, signature: "Foo()" }),
      ],
    })
    // 20 blocks against a 10-block limit on every endpoint.
    const logs = await client(chain).getLogs(1n, 20n, [address])

    expect(logs.map((log) => log.blockNumber)).toEqual([2n, 18n])
  })
})

describe("RpcClient.getTransactions", () => {
  it("batches hashes and lowercases fields", async () => {
    const [address] = addresses(1) as [Address]
    const logs = Array.from({ length: 60 }, (_, index) =>
      eventLog({ block: 2, logIndex: index, address, signature: "Foo()" }),
    )
    const chain = new FakeChain({ head: 100, logs })
    const rpc = client(chain)
    const fetched = await rpc.getLogs(1n, 10n, [address])
    const transactions = await rpc.getTransactions(
      fetched.map((log) => log.txHash),
    )

    expect(transactions).toHaveLength(60)
    // The client returns full calldata; stores persist the selector only.
    expect(transactions[0]?.input).toBe(TX_INPUT)
    const txBatches = chain.httpRequests
      .filter((methods) => methods[0] === "eth_getTransactionByHash")
      .map((methods) => methods.length)
    expect(txBatches).toEqual([50, 10])
  })
})
