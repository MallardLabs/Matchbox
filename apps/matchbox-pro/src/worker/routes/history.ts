import { ledgerStatusSchema } from "../../features/history/schema"
import { activityRoutes } from "../history/activityRoutes"
import { MAX_LOCKS } from "../history/earnings"
import { gaugeEpochsWithStatus, incentiveEpochs } from "../history/gauges"
import {
  RPC_FRESHNESS,
  UNAVAILABLE_FRESHNESS,
  decodeCursor,
  encodeCursor,
  envelope,
  parseAddress,
  parseInteger,
  parseList,
  parseNetwork,
  parseOptionalAddress,
  parseUint,
  parseUintList,
  withHistoryErrors,
} from "../history/http"
import { ledgerCsv } from "../history/views"
import {
  HISTORY_BUDGET_MS,
  type LedgerQuery,
  emptyEarnings,
  nowSeconds,
  pricingEpochs,
  walletEarnings,
  walletLedger,
} from "../history/wallet"
import type { ApiContext, ApiRoute } from "../router"

// Per-epoch history for Matchbox Pro. Earnings, the rewards ledger, gauge
// epochs, incentives and epoch-close prices come from Mezo RPC (exact
// checkpoint math, see ../history/math.ts); activity comes from the warehouse
// or the frozen explorer (../history/activityRoutes.ts).

const LEDGER_STATUSES = ledgerStatusSchema.options

function ledgerQuery(url: URL): LedgerQuery {
  return {
    from: parseUint(url, "from"),
    to: parseUint(url, "to"),
    statuses: parseList(url, "status", LEDGER_STATUSES),
    gauge: parseOptionalAddress(url, "gauge"),
    tokenId: parseUint(url, "tokenId"),
  }
}

function ledgerOffset(url: URL): number {
  const cursor = decodeCursor(url.searchParams.get("cursor"))
  if (cursor === undefined) return 0
  if (
    typeof cursor === "object" &&
    cursor !== null &&
    "o" in cursor &&
    typeof cursor.o === "number" &&
    Number.isInteger(cursor.o) &&
    cursor.o >= 0
  ) {
    return cursor.o
  }
  return 0
}

async function earnings({
  url,
  params,
  env,
  waitUntil,
}: ApiContext): Promise<Response> {
  const network = parseNetwork(url)
  const wallet = parseAddress(params.address)
  const epochs = parseInteger(url, "epochs", 8, 1, 52)
  const tokenIds = parseUintList(url, "tokenIds", MAX_LOCKS)
  if (network !== "mezo") {
    return envelope(
      network,
      UNAVAILABLE_FRESHNESS,
      emptyEarnings(nowSeconds()),
      {
        kind: "no-store",
      },
    )
  }
  const data = await walletEarnings(wallet, tokenIds, epochs, env, waitUntil)
  // A partial result (prices still retrying) must not be cached anywhere.
  return envelope(
    network,
    RPC_FRESHNESS,
    data,
    data.partial ? { kind: "no-store" } : { kind: "private", maxAge: 30 },
  )
}

async function ledger({
  url,
  params,
  env,
  waitUntil,
}: ApiContext): Promise<Response> {
  const network = parseNetwork(url)
  const wallet = parseAddress(params.address)
  const query = ledgerQuery(url)
  const limit = parseInteger(url, "limit", 100, 1, 500)
  const offset = ledgerOffset(url)
  if (network !== "mezo") {
    return envelope(
      network,
      UNAVAILABLE_FRESHNESS,
      { rows: [], nextCursor: null, partial: false },
      { kind: "no-store" },
    )
  }
  const { rows, partial } = await walletLedger(wallet, query, env, waitUntil)
  const page = rows.slice(offset, offset + limit)
  return envelope(
    network,
    RPC_FRESHNESS,
    {
      rows: page,
      nextCursor:
        offset + limit < rows.length
          ? encodeCursor({ o: offset + limit })
          : null,
      partial,
    },
    partial ? { kind: "no-store" } : { kind: "private", maxAge: 30 },
  )
}

async function ledgerCsvFile({
  url,
  params,
  env,
  waitUntil,
}: ApiContext): Promise<Response> {
  const network = parseNetwork(url)
  const wallet = parseAddress(params.address)
  const { rows, partial } =
    network === "mezo"
      ? await walletLedger(wallet, ledgerQuery(url), env, waitUntil)
      : { rows: [], partial: false }
  return new Response(ledgerCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="matchbox-rewards-${wallet.slice(0, 10)}.csv"`,
      "access-control-allow-origin": "*",
      "cache-control": partial ? "no-store" : "private, max-age=30",
    },
  })
}

async function gauge({
  url,
  params,
  env,
  waitUntil,
}: ApiContext): Promise<Response> {
  const network = parseNetwork(url)
  const address = parseAddress(params.address)
  const count = parseInteger(url, "count", 8, 1, 26)
  const boostTokenId = parseUint(url, "boostTokenId")
  if (network !== "mezo") {
    return envelope(
      network,
      UNAVAILABLE_FRESHNESS,
      { rows: [] },
      {
        kind: "no-store",
      },
    )
  }
  const { data, complete } = await gaugeEpochsWithStatus({
    gauge: address,
    count,
    boostTokenId,
    now: nowSeconds(),
    env,
    budget: { deadline: Date.now() + HISTORY_BUDGET_MS, waitUntil },
  })
  return envelope(
    network,
    RPC_FRESHNESS,
    data,
    complete
      ? { kind: "shared", sMaxAge: 300, staleWhileRevalidate: 600 }
      : { kind: "no-store" },
  )
}

async function incentives({
  url,
  env,
  waitUntil,
}: ApiContext): Promise<Response> {
  const network = parseNetwork(url)
  const count = parseInteger(url, "count", 8, 1, 26)
  if (network !== "mezo") {
    return envelope(
      network,
      UNAVAILABLE_FRESHNESS,
      { rows: [] },
      {
        kind: "no-store",
      },
    )
  }
  const { data, complete } = await incentiveEpochs({
    count,
    now: nowSeconds(),
    env,
    budget: { deadline: Date.now() + HISTORY_BUDGET_MS, waitUntil },
  })
  return envelope(
    network,
    RPC_FRESHNESS,
    data,
    complete
      ? { kind: "shared", sMaxAge: 300, staleWhileRevalidate: 600 }
      : { kind: "no-store" },
  )
}

async function pricing({ url, env, waitUntil }: ApiContext): Promise<Response> {
  const network = parseNetwork(url)
  const count = parseInteger(url, "count", 8, 1, 52)
  if (network !== "mezo") {
    return envelope(
      network,
      UNAVAILABLE_FRESHNESS,
      { rows: [] },
      {
        kind: "no-store",
      },
    )
  }
  const { data, complete } = await pricingEpochs(count, env, waitUntil)
  // Settled rows never change; anything still pricing must not be cached.
  return envelope(
    network,
    RPC_FRESHNESS,
    data,
    complete ? { kind: "shared", sMaxAge: 3600 } : { kind: "no-store" },
  )
}

export const historyRoutes: ApiRoute[] = [
  {
    method: "GET",
    path: "/api/wallets/:address/earnings",
    handler: withHistoryErrors(earnings),
  },
  {
    method: "GET",
    path: "/api/wallets/:address/ledger",
    handler: withHistoryErrors(ledger),
  },
  {
    method: "GET",
    path: "/api/wallets/:address/ledger.csv",
    handler: withHistoryErrors(ledgerCsvFile),
  },
  {
    method: "GET",
    path: "/api/gauges/:address/epochs",
    handler: withHistoryErrors(gauge),
  },
  {
    method: "GET",
    path: "/api/incentives/epochs",
    handler: withHistoryErrors(incentives),
  },
  {
    method: "GET",
    path: "/api/pricing/epochs",
    handler: withHistoryErrors(pricing),
  },
  ...activityRoutes,
]
