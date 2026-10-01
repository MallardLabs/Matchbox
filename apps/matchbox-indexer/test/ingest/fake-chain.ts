import {
  type Address,
  type Hex,
  encodeAbiParameters,
  keccak256,
  pad,
  toEventSelector,
  toHex,
} from "viem"

// An in-memory Mezo node behind a fetch() for RpcClient. Mirrors the real
// provider quirks the ingest relies on: eth_getLogs returns blockTimestamp
// "0x0", requests may be JSON-RPC batches, and filters AND addresses with a
// topic0 OR-list.

export type ChainLog = {
  block: number
  logIndex: number
  txIndex?: number
  address: Address
  topics: Hex[]
  data?: Hex
  tx?: Hex
}

type Request = { id: number; method: string; params: unknown[] }

export type FakeChainOptions = {
  head: number
  logs: ChainLog[]
  // Overrides for specific blocks, e.g. to simulate a hash mismatch.
  headerOverrides?: Map<number, { hash?: Hex; timestamp?: bigint }>
  maxAddresses?: number
}

export function blockHash(block: number): Hex {
  return keccak256(toHex(`block-${block}`))
}

export function txHash(log: ChainLog): Hex {
  return log.tx ?? keccak256(toHex(`tx-${log.block}-${log.logIndex}`))
}

export const TIMESTAMP_BASE = 1_700_000_000n

// A vote(tokenId, ...) shaped call: selector plus one argument word.
export const TX_INPUT: Hex = `0xd3672ab2${"0".repeat(63)}7`

export function blockTimestamp(block: number): bigint {
  return TIMESTAMP_BASE + BigInt(block) * 4n
}

export class FakeChain {
  readonly calls: { url: string; method: string; params: unknown[] }[] = []
  // Methods per HTTP request, to observe batching.
  readonly httpRequests: string[][] = []
  // Per-URL scripted failures: each entry is consumed by one HTTP request.
  readonly failures = new Map<string, number[]>()

  constructor(private readonly options: FakeChainOptions) {}

  failNext(url: string, ...statuses: number[]): void {
    this.failures.set(url, [...(this.failures.get(url) ?? []), ...statuses])
  }

  get fetch(): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const pending = this.failures.get(url)
      const status = pending?.shift()
      if (status !== undefined) {
        return new Response("failure", { status })
      }
      const body = JSON.parse(String(init?.body)) as Request | Request[]
      const requests = Array.isArray(body) ? body : [body]
      this.httpRequests.push(requests.map((request) => request.method))
      const responses = requests.map((request) => {
        this.calls.push({ url, method: request.method, params: request.params })
        try {
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: this.answer(request),
          }
        } catch (error) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32000, message: (error as Error).message },
          }
        }
      })
      return Response.json(Array.isArray(body) ? responses : responses[0])
    }) as typeof fetch
  }

  callsTo(method: string): { url: string; params: unknown[] }[] {
    return this.calls.filter((call) => call.method === method)
  }

  private answer(request: Request): unknown {
    switch (request.method) {
      case "eth_blockNumber":
        return toHex(this.options.head)
      case "eth_getLogs":
        return this.getLogs(request.params[0] as LogFilter)
      case "eth_getBlockByNumber": {
        const block = Number(BigInt(request.params[0] as string))
        const override = this.options.headerOverrides?.get(block)
        return {
          number: toHex(block),
          hash: override?.hash ?? blockHash(block),
          timestamp: toHex(override?.timestamp ?? blockTimestamp(block)),
        }
      }
      case "eth_getTransactionByHash": {
        const hash = request.params[0] as Hex
        const log = this.options.logs.find((entry) => txHash(entry) === hash)
        if (!log) return null
        return {
          hash,
          blockNumber: toHex(log.block),
          transactionIndex: toHex(log.txIndex ?? 0),
          from: pad("0xaa", { size: 20 }),
          to: log.address,
          input: TX_INPUT,
        }
      }
      default:
        throw new Error(`Unsupported method ${request.method}`)
    }
  }

  private getLogs(filter: LogFilter): unknown[] {
    const addresses = new Set(
      filter.address.map((address) => address.toLowerCase()),
    )
    if (
      this.options.maxAddresses &&
      addresses.size > this.options.maxAddresses
    ) {
      throw new Error("too many addresses")
    }
    const from = Number(BigInt(filter.fromBlock))
    const to = Number(BigInt(filter.toBlock))
    const topic0s = filter.topics?.[0]
    return this.options.logs
      .filter(
        (log) =>
          log.block >= from &&
          log.block <= to &&
          addresses.has(log.address.toLowerCase()) &&
          (!topic0s || topic0s.includes(log.topics[0] as Hex)),
      )
      .map((log) => ({
        address: log.address,
        topics: log.topics,
        data: log.data ?? "0x",
        blockNumber: toHex(log.block),
        blockHash: blockHash(log.block),
        blockTimestamp: "0x0",
        transactionHash: txHash(log),
        transactionIndex: toHex(log.txIndex ?? 0),
        logIndex: toHex(log.logIndex),
        removed: false,
      }))
  }
}

type LogFilter = {
  fromBlock: Hex
  toBlock: Hex
  address: Address[]
  topics?: [Hex[]]
}

export function addressTopic(address: Address): Hex {
  return pad(address.toLowerCase() as Hex, { size: 32 })
}

export function poolGaugeCreatedLog(input: {
  block: number
  logIndex: number
  voter: Address
  pool: Address
  bribe: Address
  fee: Address
  gauge: Address
}): ChainLog {
  const factory = pad("0x01", { size: 20 })
  return {
    block: input.block,
    logIndex: input.logIndex,
    address: input.voter,
    topics: [
      toEventSelector(
        "GaugeCreated(address,address,address,address,address,address,address,address)",
      ),
      addressTopic(factory),
      addressTopic(factory),
      addressTopic(factory),
    ],
    data: encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "address" },
      ],
      [input.pool, input.bribe, input.fee, input.gauge, factory],
    ),
  }
}

export function poolCreatedLog(input: {
  block: number
  logIndex: number
  factory: Address
  pool: Address
}): ChainLog {
  const token = pad("0x02", { size: 20 })
  return {
    block: input.block,
    logIndex: input.logIndex,
    address: input.factory,
    topics: [
      toEventSelector("PoolCreated(address,address,bool,address,uint256)"),
      addressTopic(token),
      addressTopic(token),
      pad("0x01", { size: 32 }),
    ],
    data: encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [input.pool, 1n],
    ),
  }
}

export function eventLog(input: {
  block: number
  logIndex: number
  address: Address
  signature: string
}): ChainLog {
  return {
    block: input.block,
    logIndex: input.logIndex,
    address: input.address,
    topics: [toEventSelector(input.signature)],
    data: "0x",
  }
}
