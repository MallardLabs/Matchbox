import type { Address, Hex } from "viem"
import { z } from "zod"
import type { Network, RpcEndpoint } from "./networks"

// What ingest fetches and stores, and what decode reads back. Addresses and
// hashes are lowercase hex.
export type RawLog = {
  network: Network
  blockNumber: bigint
  blockHash: Hex
  blockTimestamp: bigint
  txHash: Hex
  txIndex: number
  logIndex: number
  address: Address
  topics: Hex[]
  data: Hex
}

export type RawTx = {
  network: Network
  hash: Hex
  blockNumber: bigint
  txIndex: number
  from: Address
  to: Address | null
  input: Hex
}

function isLowerHex(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-f]*$/.test(value)
}

function isLowerAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[0-9a-f]{40}$/.test(value)
}

// Lowercases on the way in, so every stored hash and address compares equal.
export const lowerHexSchema = z
  .string()
  .transform((value) => value.toLowerCase())
  .pipe(z.custom<Hex>(isLowerHex, "Expected hex"))

export const lowerAddressSchema = z
  .string()
  .transform((value) => value.toLowerCase())
  .pipe(z.custom<Address>(isLowerAddress, "Expected an address"))

// JSON-RPC QUANTITY: 0x-prefixed hex.
const quantitySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]+$/)
  .transform((value) => BigInt(value))

type JsonRpcRequest = {
  jsonrpc: "2.0"
  id: number
  method: string
  params: unknown[]
}

// Error responses can carry `id: null`. Those never match a request id, so a
// batch treats them as missing (retryable) rather than as a bad body.
const jsonRpcResponseSchema = z.object({
  id: z.union([z.number(), z.string()]).nullish(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
})

type JsonRpcResponse = z.output<typeof jsonRpcResponseSchema>

const jsonRpcBodySchema = z.union([
  jsonRpcResponseSchema,
  z.array(jsonRpcResponseSchema),
])

// `blockTimestamp` is left out: Mezo reports "0x0" on every log, so
// timestamps come from block headers.
const rpcLogSchema = z.object({
  address: lowerAddressSchema,
  topics: z.array(lowerHexSchema),
  data: lowerHexSchema,
  blockNumber: quantitySchema,
  blockHash: lowerHexSchema,
  transactionHash: lowerHexSchema,
  transactionIndex: quantitySchema,
  logIndex: quantitySchema,
  removed: z.boolean().optional(),
})

type RpcLog = z.output<typeof rpcLogSchema>

const rpcTxSchema = z
  .object({
    hash: lowerHexSchema,
    blockNumber: quantitySchema.nullable(),
    transactionIndex: quantitySchema.nullable(),
    from: lowerAddressSchema,
    to: lowerAddressSchema.nullish(),
    input: lowerHexSchema,
  })
  .nullable()

const rpcBlockSchema = z
  .object({ hash: lowerHexSchema, timestamp: quantitySchema })
  .nullable()

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

export type BlockHeader = { hash: Hex; timestamp: bigint }

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

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
    // Workers throws "Illegal invocation" when fetch is called with a `this`
    // other than globalThis, as `this.fetchImpl(...)` would do.
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis)
    this.sleep = options.sleep ?? defaultSleep
    this.attemptsPerEndpoint = options.attemptsPerEndpoint ?? 3
    this.baseDelayMs = options.baseDelayMs ?? 500
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.maxRangeSplits = options.maxRangeSplits ?? 4
    this.batchConcurrency = options.batchConcurrency ?? 4
  }

  async blockNumber(): Promise<bigint> {
    return this.withFailover((endpoint) =>
      this.call(endpoint, "eth_blockNumber", [], quantitySchema),
    )
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
    const unique = [...new Set(z.array(lowerHexSchema).parse(hashes))]
    const transactions: RawTx[] = []
    const batches = chunk(unique, TX_BATCH_SIZE)
    const fetched = await mapLimit(batches, this.batchConcurrency, (batch) =>
      this.withFailover((endpoint) =>
        this.batchCall(
          endpoint,
          batch.map((hash) => ({
            method: "eth_getTransactionByHash",
            params: [hash],
          })),
          rpcTxSchema,
        ),
      ),
    )
    fetched.forEach((results, batchIndex) => {
      const batch = batches[batchIndex] ?? []
      results.forEach((tx, index) => {
        if (!tx || tx.blockNumber === null || tx.transactionIndex === null) {
          throw new RpcError(`Transaction ${batch[index]} not found`, false)
        }
        transactions.push({
          network: this.network,
          hash: tx.hash,
          blockNumber: tx.blockNumber,
          txIndex: Number(tx.transactionIndex),
          from: tx.from,
          to: tx.to ?? null,
          input: tx.input,
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
        ...(await this.call(
          endpoint,
          "eth_getLogs",
          [filter],
          z.array(rpcLogSchema),
        )),
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
      ...new Set(live.map((log) => log.blockNumber)),
    ])
    const seen = new Set<string>()
    const normalized: RawLog[] = []
    for (const log of live) {
      const txHash = log.transactionHash
      const logIndex = Number(log.logIndex)
      const key = `${txHash}-${logIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      const blockNumber = log.blockNumber
      const blockHash = log.blockHash
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
        txIndex: Number(log.transactionIndex),
        logIndex,
        address: log.address,
        topics: log.topics,
        data: log.data,
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
        this.batchCall(
          endpoint,
          batch.map((block) => ({
            method: "eth_getBlockByNumber",
            params: [toHex(block), false],
          })),
          rpcBlockSchema,
        ),
      ),
    )
    fetched.forEach((results, batchIndex) => {
      const batch = batches[batchIndex] ?? []
      results.forEach((block, index) => {
        const number = batch[index]
        if (number === undefined) {
          throw new RpcError("Block batch response out of range", false)
        }
        if (!block) throw new RpcError(`Block ${number} not found`, true)
        const timestamp = block.timestamp
        if (timestamp <= 0n) {
          throw new RpcError(
            `Block ${number} has timestamp ${timestamp}`,
            false,
          )
        }
        headers.set(number, { hash: block.hash, timestamp })
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

  private async call<Schema extends z.ZodType>(
    endpoint: RpcEndpoint,
    method: string,
    params: unknown[],
    schema: Schema,
  ): Promise<z.output<Schema>> {
    const [response] = await this.send(endpoint, [
      { jsonrpc: "2.0", id: this.nextId++, method, params },
    ])
    return unwrap(response, method, schema)
  }

  private async batchCall<Schema extends z.ZodType>(
    endpoint: RpcEndpoint,
    calls: { method: string; params: unknown[] }[],
    schema: Schema,
  ): Promise<z.output<Schema>[]> {
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
    return requests.map((request) =>
      unwrap(byId.get(request.id), request.method, schema),
    )
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
    const body = jsonRpcBodySchema.safeParse(
      await response.json().catch(() => null),
    )
    if (!body.success) throw new RpcError("Invalid JSON response", true)
    return Array.isArray(body.data) ? body.data : [body.data]
  }
}

function unwrap<Schema extends z.ZodType>(
  response: JsonRpcResponse | undefined,
  method: string,
  schema: Schema,
): z.output<Schema> {
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
  const result = schema.safeParse(response.result)
  if (!result.success) {
    // A malformed result is the endpoint's fault: move on to the next one.
    throw new RpcError(`Invalid ${method} result`, false)
  }
  return result.data
}

export function compareLogs(left: RawLog, right: RawLog): number {
  if (left.blockNumber !== right.blockNumber) {
    return left.blockNumber < right.blockNumber ? -1 : 1
  }
  return left.logIndex - right.logIndex
}
