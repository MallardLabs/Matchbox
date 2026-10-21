import { getTokenPriceType } from "@repo/shared"
import { decimalToScaledBigInt, tokenUsdMicroValue } from "../../../lib/money"
import { fetchBtcUsdPrice } from "../../btcPrice"
import { fetchMezoUsdPrice } from "../../mezoPrice"
import { cached } from "../../router"

export type PriceQuote = {
  priceUsd: string | null
  source: "skip-oracle" | "aerodrome-cl" | "unavailable"
  fetchedAt: string
}

export type PriceSnapshot = {
  btc: PriceQuote
  mezo: PriceQuote
}

export async function loadPrices(baseRpcUrl?: string): Promise<PriceSnapshot> {
  // Same isolate cache keys as GET /api/pricing/*.
  const [btc, mezo] = await Promise.all([
    cached("btc", 15_000, fetchBtcUsdPrice),
    cached("mezo", 15_000, () => fetchMezoUsdPrice(baseRpcUrl)),
  ])
  return {
    btc: {
      priceUsd: btc.price,
      source: btc.source,
      fetchedAt: new Date(btc.timestamp).toISOString(),
    },
    mezo: {
      priceUsd: mezo.price,
      source: mezo.source,
      fetchedAt: new Date(mezo.timestamp).toISOString(),
    },
  }
}

/**
 * Reference USD price for a reward token, or null when Matchbox has no
 * verified price for it. Never falls back to a hard-coded MEZO price.
 */
export function referencePrice(
  token: string,
  symbol: string,
  prices: PriceSnapshot,
): string | null {
  const kind = getTokenPriceType(token, symbol)
  if (kind === "stablecoin") return "1"
  if (kind === "btc-pegged") return prices.btc.priceUsd
  if (kind === "mezo") return prices.mezo.priceUsd
  return null
}

/** Token amount → micro-USD, or null when unpriced (never $0). */
export function tokenMicroUsd(input: {
  amount: bigint
  decimals: number
  token: string
  symbol: string
  prices: PriceSnapshot
}): bigint | null {
  const price = referencePrice(input.token, input.symbol, input.prices)
  if (price === null) return null
  return tokenUsdMicroValue(input.amount, input.decimals, price)
}

export function priceMicroUsd(price: string | null): bigint | null {
  return price === null ? null : decimalToScaledBigInt(price, 6)
}

export function priceSourceLabel(quote: PriceQuote): string {
  if (quote.source === "skip-oracle") return "Skip oracle (Mezo)"
  if (quote.source === "aerodrome-cl") return "Aerodrome CL slot0 (Base)"
  return "Unavailable"
}
