import {
  ACTIVITY_KINDS,
  type WireHistoryStatus,
} from "../../features/history/schema"
import type { ApiContext, ApiRoute } from "../router"
import { PROTOCOL_ACTIONS, actionTypesForKinds, matchesScope } from "./activity"
import {
  HistoryError,
  UNAVAILABLE_FRESHNESS,
  envelope,
  parseAddress,
  parseInteger,
  parseList,
  parseNetwork,
  parseOptionalAddress,
  parseUint,
  withHistoryErrors,
} from "./http"
import {
  type ActivityQuery,
  activityFreshness,
  queryActivity,
  queryTx,
  sourceConfig,
} from "./sources"

// Activity routes: wallet and protocol feeds (cursor-paged, newest first),
// the per-transaction permalink, and /api/history/status.

const SOURCES = [
  "BOOST_VOTER",
  "POOLS_VOTER",
  "VALIDATORS_VOTER",
  "THIRD_PARTY_VOTER",
  "VOTING_ESCROW",
] as const

function timeRange(url: URL): { from: number; to: number } {
  const now = Math.floor(Date.now() / 1000)
  const from = parseUint(url, "from")
  const to = parseUint(url, "to")
  return {
    from: from === undefined ? 0 : Number(from),
    to: to === undefined ? now : Number(to),
  }
}

async function feed(
  { url, env }: ApiContext,
  wallet: string | undefined,
): Promise<Response> {
  const network = parseNetwork(url)
  const kinds = parseList(url, "kinds", ACTIVITY_KINDS)
  const gauge = parseOptionalAddress(url, "gauge")
  const tokenId = parseUint(url, "tokenId")
  const sources = parseList(url, "source", SOURCES)
  const source = sources[0]
  const limit = parseInteger(url, "limit", 50, 1, 200)
  if (network !== "mezo") {
    return envelope(
      network,
      UNAVAILABLE_FRESHNESS,
      { items: [], nextCursor: null },
      { kind: "no-store" },
    )
  }
  const actionTypes =
    kinds.length > 0
      ? actionTypesForKinds(kinds)
      : wallet
        ? []
        : [...PROTOCOL_ACTIONS]
  const query: ActivityQuery = {
    wallet,
    actionTypes,
    gauge,
    source,
    ...timeRange(url),
    limit,
    cursor: url.searchParams.get("cursor"),
  }
  const result = await queryActivity(sourceConfig(env), query)
  const items = result.items.filter((item) =>
    matchesScope(item, {
      kinds,
      tokenId: tokenId?.toString(),
      gauge,
      source,
    }),
  )
  return envelope(
    network,
    result.freshness,
    { items, nextCursor: result.nextCursor },
    wallet
      ? { kind: "no-store" }
      : { kind: "shared", sMaxAge: 15, staleWhileRevalidate: 45 },
  )
}

async function tx({ url, params, env }: ApiContext): Promise<Response> {
  const network = parseNetwork(url)
  const raw = params.hash ?? ""
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new HistoryError(400, "invalid_request", "Invalid transaction hash.")
  }
  if (network !== "mezo") {
    return envelope(
      network,
      UNAVAILABLE_FRESHNESS,
      { index: "not_indexed", tx: null, items: [] },
      { kind: "no-store" },
    )
  }
  const hash = raw.toLowerCase() as `0x${string}`
  const { data, freshness } = await queryTx(sourceConfig(env), hash)
  return envelope(
    network,
    freshness,
    data,
    data.index === "indexed" && freshness.source === "warehouse"
      ? { kind: "immutable" }
      : { kind: "shared", sMaxAge: 15 },
  )
}

async function status({ url, env }: ApiContext): Promise<Response> {
  const network = parseNetwork(url)
  const config = sourceConfig(env)
  const freshness =
    network === "mezo" ? await activityFreshness(config) : UNAVAILABLE_FRESHNESS
  const activity: WireHistoryStatus["coverage"]["activity"] =
    freshness.state === "unavailable"
      ? "unavailable"
      : freshness.source === "warehouse"
        ? "warehouse"
        : "frozen-explorer"
  const data: WireHistoryStatus = {
    coverage: {
      earnings: "rpc",
      // Boost / validator bribe claims aren't indexed yet (indexer A1).
      claims: activity === "unavailable" ? "unavailable" : "partial",
      boostClaims: false,
      deposits: "rpc",
      activity,
    },
  }
  return envelope(network, freshness, data, { kind: "no-store" })
}

export const activityRoutes: ApiRoute[] = [
  {
    method: "GET",
    path: "/api/history/status",
    handler: withHistoryErrors(status),
  },
  {
    method: "GET",
    path: "/api/wallets/:address/activity",
    handler: withHistoryErrors((context) =>
      feed(context, parseAddress(context.params.address)),
    ),
  },
  {
    method: "GET",
    path: "/api/protocol/activity",
    handler: withHistoryErrors((context) => feed(context, undefined)),
  },
  {
    method: "GET",
    path: "/api/activity/tx/:hash",
    handler: withHistoryErrors(tx),
  },
]
