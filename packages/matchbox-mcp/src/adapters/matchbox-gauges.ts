import { CHAIN_ID, CONTRACTS } from "@repo/shared/contracts"
import {
  http,
  type Address,
  type PublicClient,
  createPublicClient,
  defineChain,
  erc20Abi,
  fallback,
  getAddress,
} from "viem"
import { z } from "zod"
import {
  type UsdAmount,
  addUsd,
  compareUsd,
  tokenValueUsd,
  usd,
  usdDecimal,
  zeroUsd,
} from "../money"

const WEEK_SECONDS = 604_800
const HISTORY_EPOCHS = 8
const DEFAULT_DATA_BASE_URL = "https://app.matchbox.markets"
const DEFAULT_RPC_URLS = [
  "https://rpc-internal.mezo.org",
  "https://rpc-http.mezo.boar.network",
  "https://mainnet.mezo.public.validationcloud.io",
  "https://mezo.drpc.org",
] as const
const BTC_TOKEN_ADDRESS = getAddress(
  "0x7B7c000000000000000000000000000000000000",
)
const MEZO_TOKEN_ADDRESS = getAddress(
  "0x7B7c000000000000000000000000000000000001",
)
const MUSD_SAVINGS_RATE_ADDRESS = getAddress(
  "0xb4D498029af77680cD1eF828b967f010d06C51CC",
)
const SKIP_BTC_ORACLE_ADDRESS = getAddress(
  "0x7b7c000000000000000000000000000000000015",
)
const MULTICALL3_ADDRESS = getAddress(
  "0xcA11bde05977b3631167028862bE2a173976CA11",
)

const rawAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((value) => getAddress(value))
const rawUintSchema = z.string().regex(/^\d+$/)
const usdStringSchema = z.string().regex(/^\d+(?:\.\d+)?$/)

const tokenStatSchema = z.object({
  token: rawAddressSchema,
  amount: rawUintSchema,
  amountUSD: usdStringSchema,
})

const votableSchema = z.object({
  id: z.string(),
  type: z.string(),
  votingBucket: z.string(),
  votingContract: rawAddressSchema,
  target: z.object({ id: rawAddressSchema, type: z.string() }),
  stats: z.object({
    gaugeFees: z.array(tokenStatSchema),
    bribes: z.array(tokenStatSchema),
    votingApr: z.number(),
  }),
  gauge: rawAddressSchema,
})

const votablesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(votableSchema),
})

const poolSchema = z.object({
  address: rawAddressSchema,
  name: z.string(),
  symbol: z.string(),
  token0: z.object({ symbol: z.string() }),
  token1: z.object({ symbol: z.string() }),
})

const poolsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(poolSchema),
})

const validatorSchema = z.object({
  moniker: z.string(),
  gauge: rawAddressSchema,
  weight: rawUintSchema,
  isAlive: z.boolean(),
})

const validatorsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(validatorSchema),
})

const activityItemSchema = z.object({
  id: z.string(),
  timestamp: z.number().int().nonnegative(),
  actionType: z.literal("incentiveAdded"),
  contract: z.string().optional(),
  tokenAddress: rawAddressSchema.optional(),
  gaugeAddress: rawAddressSchema.optional(),
  amount: rawUintSchema.optional(),
})

const activityResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(activityItemSchema),
  hasMore: z.boolean(),
})

const topologyResponseSchema = z.object({
  chainId: z.literal(CHAIN_ID.mainnet),
  generatedAt: z.string(),
  epochStart: rawUintSchema,
  gauges: z.array(
    z.object({
      gaugeAddress: rawAddressSchema,
      rewardTokens: z.array(
        z.object({
          tokenAddress: rawAddressSchema,
          symbol: z.string(),
          decimals: z.number().int().min(0).max(255),
          epochAmount: rawUintSchema,
        }),
      ),
    }),
  ),
})

const mezoPriceResponseSchema = z.object({
  price: z
    .number()
    .positive()
    .transform((value) => String(value))
    .nullable(),
})

const tokenPricesResponseSchema = z.object({
  prices: z.array(
    z.object({
      address: rawAddressSchema,
      price: z
        .number()
        .nonnegative()
        .transform((value) => String(value))
        .nullable(),
    }),
  ),
})

const weightsAbi = [
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "weights",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

const btcOracleAbi = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { internalType: "uint80", name: "roundId", type: "uint80" },
      { internalType: "int256", name: "answer", type: "int256" },
      { internalType: "uint256", name: "startedAt", type: "uint256" },
      { internalType: "uint256", name: "updatedAt", type: "uint256" },
      { internalType: "uint80", name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const

export const indexedGaugeSchema = z.object({
  id: z.string(),
  address: rawAddressSchema,
  targetAddress: rawAddressSchema.nullable(),
  name: z.string(),
  type: z.enum(["boost", "pool", "vault", "validator"]),
  governanceAsset: z.enum(["veMEZO", "veBTC"]),
  votingBucket: z.string(),
  votingContract: rawAddressSchema,
  depositedUsd: usdStringSchema,
  currentWeight: rawUintSchema,
  consistencyBps: z.number().int().min(0).max(10_000),
  fundedEpochs: z.number().int().min(0),
  observedEpochs: z.number().int().positive(),
  tokenPair: z.array(z.string()).min(1),
  pricingStatus: z.enum(["complete", "partial"]),
  unpricedTokenCount: z.number().int().nonnegative(),
})

export const gaugeSnapshotSchema = z.object({
  chainId: z.literal(CHAIN_ID.mainnet),
  blockNumber: rawUintSchema,
  epochStart: rawUintSchema,
  generatedAt: z.string(),
  gauges: z.array(indexedGaugeSchema),
  source: z.object({
    name: z.literal("Matchbox mainnet indexer + Mezo RPC"),
    url: z.string().url(),
    status: z.literal("live"),
  }),
})

export type IndexedGauge = z.infer<typeof indexedGaugeSchema>
export type GaugeSnapshot = z.infer<typeof gaugeSnapshotSchema>

type CandidateSeed = {
  address: Address
  targetAddress: Address | null
  name: string
  type: IndexedGauge["type"]
  governanceAsset: IndexedGauge["governanceAsset"]
  votingBucket: string
  votingContract: Address
  tokenPair: string[]
  depositedUsd: UsdAmount
  pricingStatus: IndexedGauge["pricingStatus"]
  unpricedTokenCount: number
  knownWeight?: string
}

export type GaugeAdapterOptions = {
  fetch?: typeof globalThis.fetch
  dataBaseUrl?: string
  rpcUrls?: string[]
  now?: Date
}

function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function epochStartFor(timestamp: number): number {
  return Math.floor(timestamp / WEEK_SECONDS) * WEEK_SECONDS
}

function urlFor(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`
}

async function fetchJson<T>(input: {
  fetch: typeof globalThis.fetch
  url: string
  schema: z.ZodType<T>
}): Promise<T> {
  const response = await input.fetch(input.url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    throw new Error(`Matchbox data source returned HTTP ${response.status}`)
  }
  const rawJson: unknown = await response.json()
  return input.schema.parse(rawJson)
}

export function createMezoClient(
  options: GaugeAdapterOptions = {},
): PublicClient {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const rpcUrls = options.rpcUrls?.length
    ? options.rpcUrls
    : [...DEFAULT_RPC_URLS]
  const chain = defineChain({
    id: CHAIN_ID.mainnet,
    name: "Mezo Mainnet",
    nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
    rpcUrls: { default: { http: rpcUrls } },
    contracts: { multicall3: { address: MULTICALL3_ADDRESS } },
  })
  return createPublicClient({
    chain,
    transport: fallback(
      rpcUrls.map((url) =>
        http(url, {
          batch: { batchSize: 100 },
          fetchFn: fetchImplementation,
          retryCount: 0,
          timeout: 15_000,
        }),
      ),
    ),
  })
}

function poolName(symbol: string, name: string): string {
  const normalized = symbol.replace(/^(sAMM|vAMM)-/i, "").replaceAll("-", " / ")
  return normalized || name
}

function vaultName(address: Address): string {
  if (address.toLowerCase() === MUSD_SAVINGS_RATE_ADDRESS.toLowerCase()) {
    return "Savings MUSD Vault"
  }
  return `Vault ${shortAddress(address)}`
}

function fundingConsistency(
  gaugeAddress: Address,
  history: z.infer<typeof activityItemSchema>[],
  firstEpoch: number,
): { consistencyBps: number; fundedEpochs: number } {
  const funded = new Set<number>()
  for (const event of history) {
    if (
      event.gaugeAddress?.toLowerCase() !== gaugeAddress.toLowerCase() ||
      !event.amount ||
      BigInt(event.amount) <= 0n
    ) {
      continue
    }
    const epoch = epochStartFor(event.timestamp)
    if (epoch >= firstEpoch) funded.add(epoch)
  }
  return {
    consistencyBps: Math.round((funded.size * 10_000) / HISTORY_EPOCHS),
    fundedEpochs: funded.size,
  }
}

function knownUsdPrice(
  tokenAddress: Address,
  symbol: string,
  prices: { btc: string | null; mezo: string | null },
): string | null {
  const normalizedSymbol = symbol.trim().toUpperCase()
  if (
    normalizedSymbol.includes("USD") ||
    normalizedSymbol === "DAI" ||
    normalizedSymbol === "MUSD"
  ) {
    return "1"
  }
  if (
    tokenAddress.toLowerCase() === BTC_TOKEN_ADDRESS.toLowerCase() ||
    normalizedSymbol === "BTC" ||
    normalizedSymbol.endsWith("BTC")
  ) {
    return prices.btc
  }
  if (
    tokenAddress.toLowerCase() === MEZO_TOKEN_ADDRESS.toLowerCase() ||
    normalizedSymbol === "MEZO"
  ) {
    return prices.mezo
  }
  return null
}

async function readTokenMetadata(
  client: ReturnType<typeof createMezoClient>,
  addresses: Address[],
): Promise<Map<string, { symbol: string; decimals: number }>> {
  if (addresses.length === 0) return new Map()
  const results = await client.multicall({
    allowFailure: true,
    contracts: addresses.flatMap((address) => [
      { address, abi: erc20Abi, functionName: "symbol" as const },
      { address, abi: erc20Abi, functionName: "decimals" as const },
    ]),
  })
  const metadata = new Map<string, { symbol: string; decimals: number }>()
  addresses.forEach((address, index) => {
    const symbolResult = results[index * 2]
    const decimalsResult = results[index * 2 + 1]
    metadata.set(address.toLowerCase(), {
      symbol:
        symbolResult?.status === "success" &&
        typeof symbolResult.result === "string"
          ? symbolResult.result
          : "UNKNOWN",
      decimals:
        decimalsResult?.status === "success" &&
        typeof decimalsResult.result === "number"
          ? decimalsResult.result
          : 18,
    })
  })
  return metadata
}

async function readReferencePrices(input: {
  client: ReturnType<typeof createMezoClient>
  fetch: typeof globalThis.fetch
  dataBaseUrl: string
}): Promise<{ btc: string | null; mezo: string | null }> {
  const [btcResults, mezoResponse] = await Promise.all([
    input.client.multicall({
      allowFailure: true,
      contracts: [
        {
          address: SKIP_BTC_ORACLE_ADDRESS,
          abi: btcOracleAbi,
          functionName: "latestRoundData",
        },
        {
          address: SKIP_BTC_ORACLE_ADDRESS,
          abi: btcOracleAbi,
          functionName: "decimals",
        },
      ],
    }),
    fetchJson({
      fetch: input.fetch,
      url: urlFor(input.dataBaseUrl, "/api/pricing/mezo"),
      schema: mezoPriceResponseSchema,
    }).catch(() => ({ price: null })),
  ])
  const round = btcResults[0]
  const decimals = btcResults[1]
  const answer =
    round?.status === "success" && Array.isArray(round.result)
      ? round.result[1]
      : undefined
  const btc =
    typeof answer === "bigint" &&
    answer > 0n &&
    decimals?.status === "success" &&
    typeof decimals.result === "number"
      ? tokenValueUsd({
          rawAmount: answer,
          decimals: decimals.result,
          priceUsd: "1",
        }).amount.toString()
      : null
  return { btc, mezo: mezoResponse.price }
}

async function readUnknownPrices(input: {
  fetch: typeof globalThis.fetch
  dataBaseUrl: string
  addresses: Address[]
}): Promise<Map<string, string | null>> {
  if (input.addresses.length === 0) return new Map()
  const searchParams = new URLSearchParams({
    network: "mezo",
    addresses: input.addresses.join(","),
  })
  const response = await fetchJson({
    fetch: input.fetch,
    url: urlFor(
      input.dataBaseUrl,
      `/api/pricing/tokens?${searchParams.toString()}`,
    ),
    schema: tokenPricesResponseSchema,
  }).catch(() => ({ prices: [] }))
  return new Map(
    response.prices.map((entry) => [entry.address.toLowerCase(), entry.price]),
  )
}

async function valueActivityEvents(input: {
  events: z.infer<typeof activityItemSchema>[]
  client: ReturnType<typeof createMezoClient>
  fetch: typeof globalThis.fetch
  dataBaseUrl: string
}): Promise<Map<string, { total: UsdAmount; unpriced: number }>> {
  const addresses = Array.from(
    new Set(
      input.events.flatMap((event) =>
        event.tokenAddress ? [event.tokenAddress.toLowerCase()] : [],
      ),
    ),
  ).map((address) => getAddress(address))
  const metadata = await readTokenMetadata(input.client, addresses)
  const references = await readReferencePrices({
    client: input.client,
    fetch: input.fetch,
    dataBaseUrl: input.dataBaseUrl,
  })
  const unknownAddresses = addresses.filter((address) => {
    const token = metadata.get(address.toLowerCase())
    return !knownUsdPrice(address, token?.symbol ?? "", references)
  })
  const unknownPrices = await readUnknownPrices({
    fetch: input.fetch,
    dataBaseUrl: input.dataBaseUrl,
    addresses: unknownAddresses,
  })
  const totals = new Map<string, { total: UsdAmount; unpriced: number }>()

  for (const event of input.events) {
    if (!event.gaugeAddress || !event.tokenAddress || !event.amount) continue
    const gaugeKey = event.gaugeAddress.toLowerCase()
    const current = totals.get(gaugeKey) ?? { total: zeroUsd(), unpriced: 0 }
    const token = metadata.get(event.tokenAddress.toLowerCase())
    const price =
      knownUsdPrice(event.tokenAddress, token?.symbol ?? "", references) ??
      unknownPrices.get(event.tokenAddress.toLowerCase()) ??
      null
    if (price === null) {
      current.unpriced += 1
    } else {
      current.total = current.total.add(
        tokenValueUsd({
          rawAmount: BigInt(event.amount),
          decimals: token?.decimals ?? 18,
          priceUsd: price,
        }),
      )
    }
    totals.set(gaugeKey, current)
  }
  return totals
}

async function readWeights(
  client: ReturnType<typeof createMezoClient>,
  seeds: CandidateSeed[],
): Promise<Map<string, string>> {
  const results = await client.multicall({
    allowFailure: true,
    contracts: seeds.map((seed) => ({
      address: seed.votingContract,
      abi: weightsAbi,
      functionName: "weights" as const,
      args: [seed.address],
    })),
  })
  const weights = new Map<string, string>()
  seeds.forEach((seed, index) => {
    const result = results[index]
    const weight =
      result?.status === "success" && typeof result.result === "bigint"
        ? result.result.toString()
        : (seed.knownWeight ?? "0")
    weights.set(seed.address.toLowerCase(), weight)
  })
  return weights
}

export async function fetchGaugeSnapshot(
  options: GaugeAdapterOptions = {},
): Promise<GaugeSnapshot> {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const dataBaseUrl = options.dataBaseUrl ?? DEFAULT_DATA_BASE_URL
  const now = options.now ?? new Date()
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const currentEpoch = epochStartFor(nowSeconds)
  const firstEpoch = currentEpoch - (HISTORY_EPOCHS - 1) * WEEK_SECONDS
  const activityParams = new URLSearchParams({
    network: "mainnet",
    from: String(firstEpoch),
    to: String(nowSeconds),
    limit: "1000",
    page: "0",
    order: "desc",
    actionTypes: "INCENTIVE_ADDED",
  })

  const [votables, pools, validators, activity, topology] = await Promise.all([
    fetchJson({
      fetch: fetchImplementation,
      url: urlFor(dataBaseUrl, "/api/votables/mainnet"),
      schema: votablesResponseSchema,
    }),
    fetchJson({
      fetch: fetchImplementation,
      url: urlFor(dataBaseUrl, "/api/pools/mainnet?filter=known"),
      schema: poolsResponseSchema,
    }),
    fetchJson({
      fetch: fetchImplementation,
      url: urlFor(dataBaseUrl, "/api/validators/mainnet"),
      schema: validatorsResponseSchema,
    }),
    fetchJson({
      fetch: fetchImplementation,
      url: urlFor(dataBaseUrl, `/api/activity?${activityParams.toString()}`),
      schema: activityResponseSchema,
    }),
    fetchJson({
      fetch: fetchImplementation,
      url: urlFor(
        dataBaseUrl,
        `/api/analytics/gauge-topology?chainId=${CHAIN_ID.mainnet}`,
      ),
      schema: topologyResponseSchema,
    }),
  ])
  if (activity.hasMore) {
    throw new Error("Gauge history exceeded the indexed page size")
  }

  const client = createMezoClient(options)
  const blockNumberPromise = client.getBlockNumber()
  const poolByAddress = new Map(
    pools.data.map((pool) => [pool.address.toLowerCase(), pool]),
  )
  const topologyByGauge = new Map(
    topology.gauges.map((gauge) => [gauge.gaugeAddress.toLowerCase(), gauge]),
  )
  const currentEvents = activity.data.filter(
    (event) => epochStartFor(event.timestamp) === currentEpoch,
  )
  const eventValues = await valueActivityEvents({
    events: currentEvents,
    client,
    fetch: fetchImplementation,
    dataBaseUrl,
  })

  const stakingSeeds: CandidateSeed[] = votables.data.map((votable) => {
    const pool = poolByAddress.get(votable.target.id.toLowerCase())
    return {
      address: votable.gauge,
      targetAddress: votable.target.id,
      name:
        votable.target.type === "pool" && pool
          ? poolName(pool.symbol, pool.name)
          : votable.target.type === "vault"
            ? vaultName(votable.target.id)
            : `${votable.target.type} ${shortAddress(votable.target.id)}`,
      type: votable.target.type === "pool" ? "pool" : "vault",
      governanceAsset: "veBTC",
      votingBucket: votable.votingBucket,
      votingContract: votable.votingContract,
      tokenPair: pool
        ? [pool.token0.symbol, pool.token1.symbol]
        : votable.target.id.toLowerCase() ===
            MUSD_SAVINGS_RATE_ADDRESS.toLowerCase()
          ? ["MUSD"]
          : ["Vault"],
      depositedUsd: addUsd(
        [...votable.stats.gaugeFees, ...votable.stats.bribes].map((token) =>
          usd(token.amountUSD),
        ),
      ),
      pricingStatus: "complete",
      unpricedTokenCount: 0,
    }
  })

  const validatorSeeds: CandidateSeed[] = validators.data
    .filter((validator) => validator.isAlive)
    .map((validator) => {
      const valued = eventValues.get(validator.gauge.toLowerCase())
      return {
        address: validator.gauge,
        targetAddress: null,
        name: validator.moniker || `Validator ${shortAddress(validator.gauge)}`,
        type: "validator",
        governanceAsset: "veBTC",
        votingBucket: "validator-gauges",
        votingContract: CONTRACTS.mainnet.validatorsVoter,
        tokenPair: ["veBTC"],
        depositedUsd: valued?.total ?? zeroUsd(),
        pricingStatus: valued?.unpriced ? "partial" : "complete",
        unpricedTokenCount: valued?.unpriced ?? 0,
        knownWeight: validator.weight,
      }
    })

  const boostGaugeAddresses = Array.from(
    new Set(
      currentEvents.flatMap((event) =>
        event.contract === "boostVoter" && event.gaugeAddress
          ? [event.gaugeAddress.toLowerCase()]
          : [],
      ),
    ),
  ).map((address) => getAddress(address))
  const boostSeeds: CandidateSeed[] = boostGaugeAddresses.map((address) => {
    const valued = eventValues.get(address.toLowerCase())
    const topologyGauge = topologyByGauge.get(address.toLowerCase())
    const symbols = Array.from(
      new Set(
        topologyGauge?.rewardTokens
          .filter((token) => BigInt(token.epochAmount) > 0n)
          .map((token) => token.symbol) ?? [],
      ),
    )
    return {
      address,
      targetAddress: null,
      name: `veBTC boost ${shortAddress(address)}`,
      type: "boost",
      governanceAsset: "veMEZO",
      votingBucket: "vebtc-boost-gauges",
      votingContract: CONTRACTS.mainnet.boostVoter,
      tokenPair: symbols.length > 0 ? symbols : ["veBTC"],
      depositedUsd: valued?.total ?? zeroUsd(),
      pricingStatus: valued?.unpriced ? "partial" : "complete",
      unpricedTokenCount: valued?.unpriced ?? 0,
    }
  })

  const seeds = [...stakingSeeds, ...validatorSeeds, ...boostSeeds]
  const [weights, blockNumber] = await Promise.all([
    readWeights(client, seeds),
    blockNumberPromise,
  ])
  const gauges = seeds
    .map((seed) => {
      const history = fundingConsistency(
        seed.address,
        activity.data,
        firstEpoch,
      )
      return indexedGaugeSchema.parse({
        id: seed.address.toLowerCase(),
        address: seed.address,
        targetAddress: seed.targetAddress,
        name: seed.name,
        type: seed.type,
        governanceAsset: seed.governanceAsset,
        votingBucket: seed.votingBucket,
        votingContract: seed.votingContract,
        depositedUsd: usdDecimal(seed.depositedUsd),
        currentWeight: weights.get(seed.address.toLowerCase()) ?? "0",
        consistencyBps: history.consistencyBps,
        fundedEpochs: history.fundedEpochs,
        observedEpochs: HISTORY_EPOCHS,
        tokenPair: seed.tokenPair,
        pricingStatus: seed.pricingStatus,
        unpricedTokenCount: seed.unpricedTokenCount,
      })
    })
    .sort((left, right) =>
      compareUsd(usd(right.depositedUsd), usd(left.depositedUsd)),
    )

  return gaugeSnapshotSchema.parse({
    chainId: CHAIN_ID.mainnet,
    blockNumber: blockNumber.toString(),
    epochStart: String(currentEpoch),
    generatedAt: now.toISOString(),
    gauges,
    source: {
      name: "Matchbox mainnet indexer + Mezo RPC",
      url: dataBaseUrl,
      status: "live",
    },
  })
}
