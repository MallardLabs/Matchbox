import { MatchboxApiError, errorFromBody, isRecord } from "./errors"
import type { components, operations } from "./generated/schema"

type Schemas = components["schemas"]

export type NetworkSlug = Schemas["NetworkSlug"]
export type Network = Schemas["Network"]
export type NetworkList = Schemas["NetworkList"]
export type GaugeProfileType = Schemas["GaugeProfileType"]
export type GaugeProfile = Schemas["GaugeProfile"]
export type BoostGaugeProfile = Schemas["BoostGaugeProfile"]
export type ValidatorGaugeProfile = Schemas["ValidatorGaugeProfile"]
export type GaugeProfileChainState = Schemas["GaugeProfileChainState"]
export type GaugeProfileList = Schemas["GaugeProfileList"]
export type GaugeProfileDetail = Schemas["GaugeProfileDetail"]
export type SourceMeta = Schemas["SourceMeta"]
export type EpochStatus = Schemas["EpochStatus"]
export type Epoch = Schemas["Epoch"]
export type CurrentEpochResponse = Schemas["CurrentEpochResponse"]
export type VoterKind = Schemas["VoterKind"]
export type Gauge = Schemas["Gauge"]
export type BoostGauge = Schemas["BoostGauge"]
export type PoolGauge = Schemas["PoolGauge"]
export type ValidatorGauge = Schemas["ValidatorGauge"]
export type ThirdPartyGauge = Schemas["ThirdPartyGauge"]
export type GaugeList = Schemas["GaugeList"]
export type GaugeDetail = Schemas["GaugeDetail"]
export type RewardKind = Schemas["RewardKind"]
export type Reward = Schemas["Reward"]
export type GaugeIncentives = Schemas["GaugeIncentives"]
export type IncentiveList = Schemas["IncentiveList"]
export type GaugeEpoch = Schemas["GaugeEpoch"]
export type GaugeEpochList = Schemas["GaugeEpochList"]
export type MarketMeta = Schemas["MarketMeta"]
export type MarketPrices = Schemas["MarketPrices"]
export type ReferencePrice = Schemas["ReferencePrice"]
export type PriceSource = Schemas["PriceSource"]

export type GaugeProfileListParams =
  operations["listGaugeProfiles"]["parameters"]["query"]

export type GaugeProfileIterateParams = Omit<GaugeProfileListParams, "cursor">

/** `alive` is a boolean here; the wire format is `"true"` / `"false"`. */
export type GaugeListParams = Omit<
  operations["listGauges"]["parameters"]["query"],
  "alive"
> & { alive?: boolean }

/** `current` (default), `next`, or an epoch start in unix seconds. */
export type EpochSelector = "current" | "next" | number

export type IncentiveListParams = Omit<
  operations["listIncentives"]["parameters"]["query"],
  "epoch"
> & { epoch?: EpochSelector }

export type GaugeEpochsParams = NonNullable<
  operations["listGaugeEpochs"]["parameters"]["query"]
>

export type FetchLike = (
  input: string,
  init: {
    method: string
    headers: Record<string, string>
    signal?: AbortSignal
  },
) => Promise<Response>

export type MatchboxClientOptions = {
  /** `mbx_pk_…` (browser, registered origins) or `mbx_sk_…` (server). */
  apiKey: string
  /** Default `https://api.matchbox.markets`. */
  baseUrl?: string
  /** Custom fetch (tests, proxies). Defaults to the global `fetch`. */
  fetch?: FetchLike
  /** Retries for 429/503 responses. Default 2. */
  maxRetries?: number
  /** Longest wait honoured between retries. Default 10 000 ms. */
  maxRetryDelayMs?: number
}

export type RequestOptions = { signal?: AbortSignal }

export type MatchboxClient = {
  networks: {
    list(options?: RequestOptions): Promise<NetworkList>
  }
  gaugeProfiles: {
    /** One page; pass `nextCursor` back as `cursor` for the next one. */
    list(
      params: GaugeProfileListParams,
      options?: RequestOptions,
    ): Promise<GaugeProfileList>
    /** Every matching profile, following cursors. */
    iterate(
      params: GaugeProfileIterateParams,
      options?: RequestOptions,
    ): AsyncGenerator<GaugeProfile, void, undefined>
    get(
      network: NetworkSlug,
      gaugeAddress: string,
      options?: RequestOptions,
    ): Promise<GaugeProfileDetail>
    /** Boost gauge profile for a veBTC token id. */
    byVebtc(
      network: NetworkSlug,
      tokenId: string | bigint | number,
      options?: RequestOptions,
    ): Promise<GaugeProfileDetail>
  }
  epochs: {
    /** The current and next Mezo Earn epoch. */
    current(options?: RequestOptions): Promise<CurrentEpochResponse>
  }
  gauges: {
    /** Every matching gauge in one response (no pagination). */
    list(params: GaugeListParams, options?: RequestOptions): Promise<GaugeList>
    get(
      network: NetworkSlug,
      gaugeAddress: string,
      options?: RequestOptions,
    ): Promise<GaugeDetail>
    /** The gauge's incentives per epoch, newest first (default 12). */
    epochs(
      network: NetworkSlug,
      gaugeAddress: string,
      params?: GaugeEpochsParams,
      options?: RequestOptions,
    ): Promise<GaugeEpochList>
    /** Boost gauge for a veBTC token id. */
    byVebtc(
      network: NetworkSlug,
      tokenId: string | bigint | number,
      options?: RequestOptions,
    ): Promise<GaugeDetail>
  }
  incentives: {
    /** Gauges with at least one reward for the epoch (default `current`). */
    list(
      params: IncentiveListParams,
      options?: RequestOptions,
    ): Promise<IncentiveList>
  }
}

export const defaultBaseUrl = "https://api.matchbox.markets"
export const defaultMaxRetries = 2
export const defaultMaxRetryDelayMs = 10_000
const baseBackoffMs = 500

/** `Retry-After` as seconds (delta-seconds or HTTP-date); null if absent. */
export function parseRetryAfter(
  value: string | null,
  nowMs: number = Date.now(),
): number | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
  const date = Date.parse(trimmed)
  if (Number.isNaN(date)) return null
  return Math.max(Math.ceil((date - nowMs) / 1000), 0)
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(done, ms)
    function done() {
      signal?.removeEventListener("abort", aborted)
      resolve()
    }
    function aborted() {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener("abort", aborted, { once: true })
  })
}

function isNetworkList(value: unknown): value is NetworkList {
  return isRecord(value) && Array.isArray(value.data)
}

function isGaugeProfileList(value: unknown): value is GaugeProfileList {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    (value.nextCursor === null || typeof value.nextCursor === "string") &&
    isRecord(value.meta)
  )
}

function isGaugeProfileDetail(value: unknown): value is GaugeProfileDetail {
  return (
    isRecord(value) &&
    isRecord(value.data) &&
    typeof value.data.profileType === "string" &&
    isRecord(value.meta)
  )
}

function listQuery(params: GaugeProfileListParams): string {
  const search = new URLSearchParams()
  search.set("network", params.network)
  if (params.profileType !== undefined) {
    search.set("profileType", params.profileType)
  }
  if (params.tag !== undefined) search.set("tag", params.tag)
  if (params.updatedSince !== undefined) {
    search.set("updatedSince", params.updatedSince)
  }
  for (const address of params.address ?? []) search.append("address", address)
  if (params.limit !== undefined) search.set("limit", String(params.limit))
  if (params.cursor !== undefined) search.set("cursor", params.cursor)
  return search.toString()
}

function isCurrentEpochResponse(value: unknown): value is CurrentEpochResponse {
  return (
    isRecord(value) &&
    isRecord(value.data) &&
    isRecord(value.data.current) &&
    isRecord(value.data.next)
  )
}

/** `{ data: [...], meta: {...} }`, the market list envelope. */
function isMarketList(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.data) && isRecord(value.meta)
}

function isGaugeList(value: unknown): value is GaugeList {
  return isMarketList(value)
}

function isIncentiveList(value: unknown): value is IncentiveList {
  return isMarketList(value)
}

function isGaugeEpochList(value: unknown): value is GaugeEpochList {
  return isMarketList(value)
}

function isGaugeDetail(value: unknown): value is GaugeDetail {
  return (
    isRecord(value) &&
    isRecord(value.data) &&
    typeof value.data.voter === "string" &&
    isRecord(value.meta)
  )
}

function gaugeListQuery(params: GaugeListParams): string {
  const search = new URLSearchParams()
  search.set("network", params.network)
  if (params.voter !== undefined) search.set("voter", params.voter)
  if (params.alive !== undefined) search.set("alive", String(params.alive))
  for (const gauge of params.gauge ?? []) search.append("gauge", gauge)
  return search.toString()
}

function incentiveListQuery(params: IncentiveListParams): string {
  const search = new URLSearchParams()
  search.set("network", params.network)
  if (params.epoch !== undefined) search.set("epoch", String(params.epoch))
  if (params.voter !== undefined) search.set("voter", params.voter)
  for (const gauge of params.gauge ?? []) search.append("gauge", gauge)
  return search.toString()
}

function gaugePath(network: NetworkSlug, gaugeAddress: string): string {
  return `/v1/gauges/${encodeURIComponent(network)}/${encodeURIComponent(gaugeAddress)}`
}

/**
 * Client for the Matchbox API. Works in browsers (publishable keys),
 * Node 18+, Deno, Bun and Cloudflare Workers.
 */
export function createMatchboxClient(
  options: MatchboxClientOptions,
): MatchboxClient {
  if (!/^mbx_(pk|sk)_(test|live)_/.test(options.apiKey)) {
    throw new TypeError("apiKey must be an mbx_pk_… or mbx_sk_… Matchbox key")
  }
  const baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/+$/, "")
  const fetchImpl: FetchLike =
    options.fetch ??
    function globalFetch(input, init) {
      return globalThis.fetch(input, init)
    }
  const maxRetries = Math.max(options.maxRetries ?? defaultMaxRetries, 0)
  const maxRetryDelayMs = options.maxRetryDelayMs ?? defaultMaxRetryDelayMs

  async function send(
    path: string,
    request: RequestOptions,
  ): Promise<Response> {
    const init = {
      method: "GET",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: "application/json",
      },
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    }
    try {
      return await fetchImpl(`${baseUrl}${path}`, init)
    } catch (cause) {
      if (request.signal?.aborted === true) throw cause
      throw new MatchboxApiError({
        status: 0,
        code: "network_error",
        message: "Could not reach the Matchbox API.",
        requestId: null,
        retryAfter: null,
        docsUrl: null,
        issues: [],
        cause,
      })
    }
  }

  async function readJson(response: Response): Promise<unknown> {
    try {
      const body: unknown = await response.json()
      return body
    } catch {
      return undefined
    }
  }

  async function getJson<Result>(
    path: string,
    isResult: (value: unknown) => value is Result,
    request: RequestOptions = {},
  ): Promise<Result> {
    for (let attempt = 0; ; attempt++) {
      const response = await send(path, request)
      const requestId = response.headers.get("X-Request-Id")
      if (response.ok) {
        const body = await readJson(response)
        if (isResult(body)) return body
        throw new MatchboxApiError({
          status: response.status,
          code: "invalid_response",
          message: "The Matchbox API returned an unexpected body.",
          requestId,
          retryAfter: null,
          docsUrl: null,
          issues: [],
        })
      }
      const retryAfter = parseRetryAfter(response.headers.get("Retry-After"))
      const retryable = response.status === 429 || response.status === 503
      const delayMs =
        retryAfter === null ? baseBackoffMs * 2 ** attempt : retryAfter * 1000
      if (retryable && attempt < maxRetries && delayMs <= maxRetryDelayMs) {
        await response.body?.cancel().catch(() => undefined)
        await sleep(delayMs, request.signal)
        continue
      }
      throw errorFromBody({
        status: response.status,
        body: await readJson(response),
        headerRequestId: requestId,
        retryAfter,
      })
    }
  }

  function list(
    params: GaugeProfileListParams,
    request?: RequestOptions,
  ): Promise<GaugeProfileList> {
    return getJson(
      `/v1/gauge-profiles?${listQuery(params)}`,
      isGaugeProfileList,
      request,
    )
  }

  return {
    networks: {
      list(request) {
        return getJson("/v1/networks", isNetworkList, request)
      },
    },
    gaugeProfiles: {
      list,
      async *iterate(params, request) {
        let cursor: string | null = null
        do {
          const page: GaugeProfileList = await list(
            cursor === null ? params : { ...params, cursor },
            request,
          )
          yield* page.data
          cursor = page.nextCursor
        } while (cursor !== null)
      },
      get(network, gaugeAddress, request) {
        return getJson(
          `/v1/gauge-profiles/${encodeURIComponent(network)}/${encodeURIComponent(gaugeAddress)}`,
          isGaugeProfileDetail,
          request,
        )
      },
      byVebtc(network, tokenId, request) {
        return getJson(
          `/v1/vebtc/${encodeURIComponent(network)}/${encodeURIComponent(String(tokenId))}/gauge-profile`,
          isGaugeProfileDetail,
          request,
        )
      },
    },
    epochs: {
      current(request) {
        return getJson("/v1/epochs/current", isCurrentEpochResponse, request)
      },
    },
    gauges: {
      list(params, request) {
        return getJson(
          `/v1/gauges?${gaugeListQuery(params)}`,
          isGaugeList,
          request,
        )
      },
      get(network, gaugeAddress, request) {
        return getJson(gaugePath(network, gaugeAddress), isGaugeDetail, request)
      },
      epochs(network, gaugeAddress, params, request) {
        const limit = params?.limit
        const query = limit === undefined ? "" : `?limit=${String(limit)}`
        return getJson(
          `${gaugePath(network, gaugeAddress)}/epochs${query}`,
          isGaugeEpochList,
          request,
        )
      },
      byVebtc(network, tokenId, request) {
        return getJson(
          `/v1/vebtc/${encodeURIComponent(network)}/${encodeURIComponent(String(tokenId))}/gauge`,
          isGaugeDetail,
          request,
        )
      },
    },
    incentives: {
      list(params, request) {
        return getJson(
          `/v1/incentives?${incentiveListQuery(params)}`,
          isIncentiveList,
          request,
        )
      },
    },
  }
}
