import { type Address, pad, toEventSelector } from "viem"
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

  // Audit MBX-02: an address-less topic scan counted every emitter on chain
  // toward the provider's result cap, so one block of look-alikes stalled it.
  it("names its addresses, so other contracts' logs never reach the cap", async () => {
    const watched = addresses(3)
    const [stranger] = addresses(4).slice(3) as [Address]
    const lookAlikes = Array.from({ length: 6 }, (_, index) =>
      eventLog({
        block: 2,
        logIndex: 10 + index,
        address: stranger,
        signature: "Foo()",
      }),
    )
    const chain = new FakeChain({
      head: 100,
      logsCap: 5,
      logs: [
        ...watched.map((address, index) =>
          eventLog({ block: 2, logIndex: index, address, signature: "Foo()" }),
        ),
        ...lookAlikes,
      ],
    })
    const logs = await client(chain, 2).getLogsForFilters(1n, 10n, [
      { addresses: watched, topic0s: [toEventSelector("Foo()")] },
    ])

    expect(logs.map((log) => log.address)).toEqual(watched)
    const calls = chain.callsTo("eth_getLogs")
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      const filter = call.params[0] as { address?: Address[] }
      expect(filter.address).toBeDefined()
      expect(filter.address).not.toContain(stranger)
    }
  })

  it("splits a block over the cap by address", async () => {
    const [first, second] = addresses(2) as [Address, Address]
    const busy = [first, second].flatMap((address, offset) =>
      Array.from({ length: 3 }, (_, index) =>
        eventLog({
          block: 4,
          logIndex: offset * 3 + index,
          address,
          signature: "Foo()",
        }),
      ),
    )
    const chain = new FakeChain({ head: 100, logsCap: 4, logs: busy })
    const logs = await client(chain).getLogs(1n, 10n, [first, second])

    expect(logs.map((log) => log.logIndex)).toEqual([0, 1, 2, 3, 4, 5])
    const single = chain
      .callsTo("eth_getLogs")
      .map((call) => (call.params[0] as { address: Address[] }).address)
      .filter((filter) => filter.length === 1)
    expect(single).toContainEqual([first])
    expect(single).toContainEqual([second])
  })

  it("splits only the address chunk that is over the cap", async () => {
    const watched = addresses(4)
    const [quiet, , , hot] = watched as [Address, Address, Address, Address]
    const chain = new FakeChain({
      head: 100,
      logsCap: 4,
      logs: [
        eventLog({ block: 3, logIndex: 0, address: quiet, signature: "Foo()" }),
        ...Array.from({ length: 5 }, (_, index) =>
          eventLog({
            block: 6 + index,
            logIndex: 0,
            address: hot,
            signature: "Foo()",
          }),
        ),
      ],
    })
    const rpc = new RpcClient({
      network: "mezo",
      fetch: chain.fetch,
      sleep: async () => {},
      endpoints: [{ url: PRIMARY, maxAddresses: 2, maxBlockRange: 10 }],
    })
    const logs = await rpc.getLogs(1n, 10n, watched)

    expect(logs).toHaveLength(6)
    const quietCalls = chain
      .callsTo("eth_getLogs")
      .filter((call) =>
        (call.params[0] as { address: Address[] }).address.includes(quiet),
      )
    expect(quietCalls).toHaveLength(1)
  })

  // push(...logs) overflowed the stack at about 125,000 logs, so a dense
  // window failed for good.
  it("returns more logs than fit in a call's arguments", async () => {
    const [address] = addresses(1) as [Address]
    const perBlock = 8_000
    const busyBlocks = 20
    const topic = toEventSelector("Foo()")
    type Request = { id: number; method: string; params: unknown[] }
    const fetchImpl = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const body = JSON.parse(String(init?.body)) as Request | Request[]
      if (Array.isArray(body)) {
        // Header batches.
        return Response.json(
          body.map((request) => {
            const block = Number(BigInt(request.params[0] as string))
            return {
              jsonrpc: "2.0",
              id: request.id,
              result: {
                hash: blockHash(block),
                timestamp: `0x${blockTimestamp(block).toString(16)}`,
              },
            }
          }),
        )
      }
      const request = body
      const reply = (result: unknown) =>
        Response.json({ jsonrpc: "2.0", id: request.id, result })
      const filter = request.params[0] as { fromBlock: string; toBlock: string }
      const from = Number(BigInt(filter.fromBlock))
      const to = Math.min(Number(BigInt(filter.toBlock)), busyBlocks)
      if ((to - from + 1) * perBlock > 10_000) {
        return Response.json({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32000, message: "query returned more than 10000" },
        })
      }
      const logs = []
      for (let block = from; block <= to; block++) {
        for (let index = 0; index < perBlock; index++) {
          logs.push({
            address,
            topics: [topic],
            data: "0x",
            blockNumber: `0x${block.toString(16)}`,
            blockHash: blockHash(block),
            transactionHash: blockHash(block),
            transactionIndex: "0x0",
            logIndex: `0x${index.toString(16)}`,
          })
        }
      }
      return reply(logs)
    }) as typeof fetch
    const rpc = new RpcClient({
      network: "mezo",
      fetch: fetchImpl,
      sleep: async () => {},
      endpoints: [{ url: PRIMARY, maxAddresses: 100, maxBlockRange: 10 }],
    })
    // 160,000 logs, all in the first half of the range, so both a split and
    // the address chunk return them in one piece.
    const logs = await rpc.getLogsForFilters(1n, 40n, [
      { addresses: [address], topic0s: [topic] },
    ])

    expect(logs).toHaveLength(perBlock * busyBlocks)
    expect(logs.at(-1)?.blockNumber).toBe(BigInt(busyBlocks))
  }, 60_000)

  it("fails, naming the block, when one contract alone fills it past the cap", async () => {
    const [address] = addresses(1) as [Address]
    const chain = new FakeChain({
      head: 100,
      logsCap: 4,
      logs: Array.from({ length: 5 }, (_, index) =>
        eventLog({ block: 4, logIndex: index, address, signature: "Foo()" }),
      ),
    })

    await expect(client(chain).getLogs(1n, 10n, [address])).rejects.toThrow(
      `No endpoint serves the logs of ${address} in block 4`,
    )
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

  it("stops splitting a query that keeps failing after maxLogSplits", async () => {
    const [address] = addresses(1) as [Address]
    let requests = 0
    const rpc = new RpcClient({
      network: "mezo",
      sleep: async () => {},
      maxLogSplits: 3,
      endpoints: [{ url: PRIMARY, maxAddresses: 100, maxBlockRange: 10 }],
      fetch: (async () => {
        requests++
        return new Response("bad request", { status: 400 })
      }) as typeof fetch,
    })

    await expect(rpc.getLogs(1n, 10n, [address])).rejects.toThrow(
      /still failing after 3 splits/,
    )
    // The query and three of its halves, one attempt each.
    expect(requests).toBe(4)
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
