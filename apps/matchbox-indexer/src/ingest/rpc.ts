import type { Address, Hex } from "viem"
import type { Network, RawLog, RawTx } from "../types"
import type { RpcEndpoint } from "./networks"

type JsonRpcRequest = {
  jsonrpc: "2.0"
  id: number
  method: string
  params: unknown[]
}

type JsonRpcResponse = {
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

type RpcLog = {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  blockHash: string
  // Always "0x0" on Mezo. Unused: timestamps come from block headers.
  blockTimestamp?: string
  transactionHash: string
  transactionIndex: string
  logIndex: string
  removed?: boolean
}

type RpcTx = {
  hash: string
  blockNumber: string | null
  transactionIndex: string | null
  from: string
  to: string | null
  input: string
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = "RpcError"
  }
}

export type RpcClientOptions = {
  endpoints: RpcEndpoint[]
  network: Network
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  attemptsPerEndpoint?: number
  baseDelayMs?: number
  timeoutMs?: number
  // Splits a failing eth_getLogs range in half this many times before giving
  // up. Covers "too many results" without parsing provider error strings.
  maxRangeSplits?: number
  // Header and transaction batches in flight at once, per call.
  batchConcurrency?: number
}

export type LogFilter = { addresses: Address[]; topic0s?: Hex[] | undefined }

const TX_BATCH_SIZE = 50
const HEADER_BATCH_SIZE = 50

type RpcBlock = { hash: string; timestamp: string }

export type BlockHeader = { hash: Hex; timestamp: bigint }

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

function hexToBigInt(value: string): bigint {
  return BigInt(value)
}

function toHex(value: bigint): Hex {
  return `0x${value.toString(16)}`
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

// Runs `work` over `items` with at most `limit` in flight, keeping order.
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++
      results[index] = await work(items[index] as T)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}

export class RpcClient {
  private readonly endpoints: RpcEndpoint[]
  private readonly network: Network
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly attemptsPerEndpoint: number
  private readonly baseDelayMs: number
  private readonly timeoutMs: number
  private readonly maxRangeSplits: number
  private readonly batchConcurrency: number
  private nextId = 1

  constructor(options: RpcClientOptions) {
    if (options.endpoints.length === 0) {
      throw new Error("RpcClient needs at least one endpoint")
    }
    this.endpoints = options.endpoints
    this.network = options.network
    this.fetchImpl = options.fetch ?? fetch
    this.sleep = options.sleep ?? defaultSleep
    this.attemptsPerEndpoint = options.attemptsPerEndpoint ?? 3
    this.baseDelayMs = options.baseDelayMs ?? 500
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.maxRangeSplits = options.maxRangeSplits ?? 4
    this.batchConcurrency = options.batchConcurrency ?? 4
  }

  async blockNumber(): Promise<bigint> {
    const result = await this.withFailover((endpoint) =>
      this.call<string>(endpoint, "eth_blockNumber", []),
    )
    return hexToBigInt(result)
  }

  // Logs emitted by `addresses` in [fromBlock, toBlock] whose topic0 is one of
  // `topic0s` (all topics when omitted), ordered by (block, logIndex).
  // Removed (reorged) logs are dropped.
  async getLogs(
    fromBlock: bigint,
    toBlock: bigint,
    addresses: Address[],
    topic0s?: Hex[],
  ): Promise<RawLog[]> {
    return this.getLogsForFilters(fromBlock, toBlock, [{ addresses, topic0s }])
  }

  // Several filters over one range. Fetched in parallel, then normalized
  // together so each block header is fetched once per range.
  async getLogsForFilters(
    fromBlock: bigint,
    toBlock: bigint,
    filters: LogFilter[],
  ): Promise<RawLog[]> {
    if (fromBlock > toBlock) return []
    const active = filters.filter((filter) => filter.addresses.length > 0)
    const batches = await Promise.all(
      active.map((filter) =>
        this.getLogsSplitting(
          fromBlock,
          toBlock,
          filter.addresses,
          this.maxRangeSplits,
          filter.topic0s,
        ),
      ),
    )
    const normalized = await this.normalizeLogs(batches.flat())
    return normalized.sort(compareLogs)
  }

  async getTransactions(hashes: Hex[]): Promise<RawTx[]> {
    const unique = [...new Set(hashes.map((hash) => hash.toLowerCase() as Hex))]
    const transactions: RawTx[] = []
    const batches = chunk(unique, TX_BATCH_SIZE)
    const fetched = await mapLimit(batches, this.batchConcurrency, (batch) =>
      this.withFailover((endpoint) =>
        this.batchCall<RpcTx | null>(
          endpoint,
          batch.map((hash) => ({
            method: "eth_getTransactionByHash",
            params: [hash],
          })),
        ),
      ),
    )
    fetched.forEach((results, batchIndex) => {
      const batch = batches[batchIndex] as Hex[]
      results.forEach((tx, index) => {
        if (!tx || tx.blockNumber === null || tx.transactionIndex === null) {
          throw new RpcError(`Transaction ${batch[index]} not found`, false)
        }
        transactions.push({
          network: this.network,
          hash: tx.hash.toLowerCase() as Hex,
          blockNumber: hexToBigInt(tx.blockNumber),
          txIndex: Number(hexToBigInt(tx.transactionIndex)),
          from: tx.from.toLowerCase() as Address,
          to: tx.to ? (tx.to.toLowerCase() as Address) : null,
          input: tx.input.toLowerCase() as Hex,
        })
      })
    })
    return transactions
  }

  private async getLogsSplitting(
    fromBlock: bigint,
    toBlock: bigint,
    addresses: Address[],
    splitsLeft: number,
    topic0s?: Hex[],
  ): Promise<RpcLog[]> {
    try {
      return await this.withFailover((endpoint) =>
        this.getLogsOnEndpoint(
          endpoint,
          fromBlock,
          toBlock,
          addresses,
          topic0s,
        ),
      )
    } catch (error) {
      if (splitsLeft <= 0 || fromBlock === toBlock) throw error
      const middle = fromBlock + (toBlock - fromBlock) / 2n
      const left = await this.getLogsSplitting(
        fromBlock,
        middle,
        addresses,
        splitsLeft - 1,
        topic0s,
      )
      const right = await this.getLogsSplitting(
        middle + 1n,
        toBlock,
        addresses,
        splitsLeft - 1,
        topic0s,
      )
      return [...left, ...right]
    }
  }

  private async getLogsOnEndpoint(
    endpoint: RpcEndpoint,
    fromBlock: bigint,
    toBlock: bigint,
    addresses: Address[],
    topic0s?: Hex[],
  ): Promise<RpcLog[]> {
    if (toBlock - fromBlock + 1n > BigInt(endpoint.maxBlockRange)) {
      throw new RpcError(
        `Range ${fromBlock}-${toBlock} exceeds ${endpoint.url} limit`,
        false,
      )
    }
    const logs: RpcLog[] = []
    for (const addressChunk of chunk(addresses, endpoint.maxAddresses)) {
      const filter = {
        fromBlock: toHex(fromBlock),
        toBlock: toHex(toBlock),
        address: addressChunk,
        ...(topic0s ? { topics: [topic0s] } : {}),
      }
      logs.push(
        ...(await this.call<RpcLog[]>(endpoint, "eth_getLogs", [filter])),
      )
    }
    return logs
  }

  // Mezo's eth_getLogs reports blockTimestamp "0x0" on every log, so the
  // timestamp always comes from the block header. The header hash must match
  // the log's blockHash; a mismatch means the chain moved under the window,
  // and the window fails rather than storing a mixed view.
  private async normalizeLogs(logs: RpcLog[]): Promise<RawLog[]> {
    const live = logs.filter((log) => log.removed !== true)
    const headers = await this.blockHeaders([
      ...new Set(live.map((log) => hexToBigInt(log.blockNumber))),
    ])
    const seen = new Set<string>()
    const normalized: RawLog[] = []
    for (const log of live) {
      const txHash = log.transactionHash.toLowerCase() as Hex
      const logIndex = Number(hexToBigInt(log.logIndex))
      const key = `${txHash}-${logIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      const blockNumber = hexToBigInt(log.blockNumber)
      const blockHash = log.blockHash.toLowerCase() as Hex
      const header = headers.get(blockNumber)
      if (!header) {
        throw new RpcError(`Block ${blockNumber} header missing`, false)
      }
      if (header.hash !== blockHash) {
        throw new RpcError(
          `Block ${blockNumber} hash mismatch: log ${blockHash}, header ${header.hash}`,
          false,
        )
      }
      normalized.push({
        network: this.network,
        blockNumber,
        blockHash,
        blockTimestamp: header.timestamp,
        txHash,
        txIndex: Number(hexToBigInt(log.transactionIndex)),
        logIndex,
        address: log.address.toLowerCase() as Address,
        topics: log.topics.map((topic) => topic.toLowerCase() as Hex),
        data: log.data.toLowerCase() as Hex,
      })
    }
    return normalized
  }

  // Batched eth_getBlockByNumber(n, false). Every timestamp is checked to be
  // positive so a zero can never reach matchbox_raw.logs.
  async blockHeaders(blocks: bigint[]): Promise<Map<bigint, BlockHeader>> {
    const headers = new Map<bigint, BlockHeader>()
    const batches = chunk(blocks, HEADER_BATCH_SIZE)
    const fetched = await mapLimit(batches, this.batchConcurrency, (batch) =>
      this.withFailover((endpoint) =>
        this.batchCall<RpcBlock | null>(
          endpoint,
          batch.map((block) => ({
            method: "eth_getBlockByNumber",
            params: [toHex(block), false],
          })),
        ),
      ),
    )
    fetched.forEach((results, batchIndex) => {
      const batch = batches[batchIndex] as bigint[]
      results.forEach((block, index) => {
        const number = batch[index] as bigint
        if (!block) throw new RpcError(`Block ${number} not found`, true)
        const timestamp = hexToBigInt(block.timestamp)
        if (timestamp <= 0n) {
          throw new RpcError(
            `Block ${number} has timestamp ${timestamp}`,
            false,
          )
        }
        headers.set(number, {
          hash: block.hash.toLowerCase() as Hex,
          timestamp,
        })
      })
    })
    return headers
  }

  // Tries each endpoint in order; retries retryable failures with exponential
  // backoff before moving on. Non-retryable failures move on immediately.
  private async withFailover<T>(
    operation: (endpoint: RpcEndpoint) => Promise<T>,
  ): Promise<T> {
    const failures: string[] = []
    for (const endpoint of this.endpoints) {
      for (let attempt = 0; attempt < this.attemptsPerEndpoint; attempt++) {
        try {
          return await operation(endpoint)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push(`${endpoint.url}: ${message}`)
          const retryable = !(error instanceof RpcError) || error.retryable
          if (!retryable) break
          if (attempt < this.attemptsPerEndpoint - 1) {
            await this.sleep(this.baseDelayMs * 2 ** attempt)
          }
        }
      }
    }
    throw new RpcError(
      `All RPC endpoints failed: ${failures.join(" | ")}`,
      false,
    )
  }

  private async call<T>(
    endpoint: RpcEndpoint,
    method: string,
    params: unknown[],
  ): Promise<T> {
    const [response] = await this.send(endpoint, [
      { jsonrpc: "2.0", id: this.nextId++, method, params },
    ])
    return unwrap<T>(response)
  }

  private async batchCall<T>(
    endpoint: RpcEndpoint,
    calls: { method: string; params: unknown[] }[],
  ): Promise<T[]> {
    const requests = calls.map(
      (call): JsonRpcRequest => ({
        jsonrpc: "2.0",
        id: this.nextId++,
        method: call.method,
        params: call.params,
      }),
    )
    const responses = await this.send(endpoint, requests)
    const byId = new Map(responses.map((response) => [response.id, response]))
    return requests.map((request) => unwrap<T>(byId.get(request.id)))
  }

  private async send(
    endpoint: RpcEndpoint,
    requests: JsonRpcRequest[],
  ): Promise<JsonRpcResponse[]> {
    let response: Response
    try {
      response = await this.fetchImpl(endpoint.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requests.length === 1 ? requests[0] : requests),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new RpcError(`Network error: ${message}`, true)
    }
    if (response.status === 429 || response.status >= 500) {
      throw new RpcError(`HTTP ${response.status}`, true)
    }
    if (!response.ok) {
      throw new RpcError(`HTTP ${response.status}`, false)
    }
    const body = (await response.json().catch(() => null)) as
      | JsonRpcResponse
      | JsonRpcResponse[]
      | null
    if (body === null) throw new RpcError("Invalid JSON response", true)
    return Array.isArray(body) ? body : [body]
  }
}

function unwrap<T>(response: JsonRpcResponse | undefined): T {
  if (!response) throw new RpcError("Missing JSON-RPC response", true)
  if (response.error) {
    // -32005 is the common "limit exceeded / rate limited" code.
    const retryable =
      response.error.code === -32005 || response.error.code === -32603
    throw new RpcError(
      `JSON-RPC ${response.error.code}: ${response.error.message}`,
      retryable,
    )
  }
  return response.result as T
}

export function compareLogs(left: RawLog, right: RawLog): number {
  if (left.blockNumber !== right.blockNumber) {
    return left.blockNumber < right.blockNumber ? -1 : 1
  }
  return left.logIndex - right.logIndex
}
