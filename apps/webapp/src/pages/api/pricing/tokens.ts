import { getAddress } from "viem"

export const config = {
  runtime: "edge",
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

const GECKOTERMINAL_API_BASE = "https://api.geckoterminal.com/api/v2"
const DEFAULT_NETWORK = "mezo"
const MAX_TOKENS_PER_REQUEST = 30

type GeckoToken = {
  attributes?: {
    address?: string
    price_usd?: string | null
    total_reserve_in_usd?: string | null
    volume_usd?: {
      h24?: string | null
    }
  }
}

type TokenPriceEntry = {
  address: string
  price: number | null
  source: "geckoterminal" | "unavailable"
  reserveUsd: number | null
  volume24hUsd: number | null
}

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...init?.headers,
    },
  })
}

function parseUsdNumber(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function normalizeAddresses(rawAddresses: string[]): string[] {
  const seen = new Set<string>()
  const addresses: string[] = []

  for (const rawAddress of rawAddresses) {
    const trimmed = rawAddress.trim()
    if (!trimmed) continue

    const address = getAddress(trimmed)
    const key = address.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    addresses.push(address)
  }

  return addresses
}

function getRequestedAddresses(request: Request): string[] {
  const url = new URL(request.url)
  const addressParams = url.searchParams.getAll("address")
  const addressesParam = url.searchParams.get("addresses")
  const rawAddresses = [...addressParams, ...(addressesParam?.split(",") ?? [])]

  return normalizeAddresses(rawAddresses)
}

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    })
  }

  if (request.method !== "GET") {
    return json({ error: "method-not-allowed" }, { status: 405 })
  }

  let addresses: string[]
  try {
    addresses = getRequestedAddresses(request)
  } catch {
    return json({ error: "invalid-address" }, { status: 400 })
  }

  if (addresses.length === 0) {
    return json({ prices: [], timestamp: Date.now() })
  }

  if (addresses.length > MAX_TOKENS_PER_REQUEST) {
    return json(
      {
        error: "too-many-addresses",
        max: MAX_TOKENS_PER_REQUEST,
      },
      { status: 400 },
    )
  }

  const url = new URL(request.url)
  const network = url.searchParams.get("network") || DEFAULT_NETWORK
  if (network !== "mezo") {
    return json({ error: "unsupported-network" }, { status: 400 })
  }

  const priceByAddress = new Map<string, TokenPriceEntry>(
    addresses.map((address) => [
      address.toLowerCase(),
      {
        address,
        price: null as number | null,
        source: "unavailable" as const,
        reserveUsd: null as number | null,
        volume24hUsd: null as number | null,
      },
    ]),
  )

  try {
    const response = await fetch(
      `${GECKOTERMINAL_API_BASE}/networks/${network}/tokens/multi/${addresses.join(",")}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    )

    if (!response.ok) {
      return json(
        {
          prices: Array.from(priceByAddress.values()),
          reason: "upstream-error",
          status: response.status,
          timestamp: Date.now(),
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
          },
        },
      )
    }

    const body = (await response.json()) as { data?: GeckoToken[] }
    for (const token of body.data ?? []) {
      const rawAddress = token.attributes?.address
      if (!rawAddress) continue

      const address = getAddress(rawAddress)
      const entry = priceByAddress.get(address.toLowerCase())
      if (!entry) continue

      const price = parseUsdNumber(token.attributes?.price_usd)
      entry.price = price
      entry.source = price === null ? "unavailable" : "geckoterminal"
      entry.reserveUsd = parseUsdNumber(token.attributes?.total_reserve_in_usd)
      entry.volume24hUsd = parseUsdNumber(token.attributes?.volume_usd?.h24)
    }

    return json(
      {
        prices: Array.from(priceByAddress.values()),
        timestamp: Date.now(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown-error"
    return json(
      {
        prices: Array.from(priceByAddress.values()),
        reason: "request-failed",
        error: message.slice(0, 240),
        timestamp: Date.now(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      },
    )
  }
}
