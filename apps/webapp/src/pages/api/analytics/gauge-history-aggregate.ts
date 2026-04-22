import { createClient } from "@supabase/supabase-js"

export const config = {
  runtime: "edge",
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

const SECONDS_PER_DAY = 86_400

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

type GaugeHistoryRow = {
  epoch_start: number
  total_incentives_usd: number | null
  vemezo_weight: string | null
  vebtc_weight: string | null
  gauge_address: string
  boost_multiplier: number | null
}

type AggregatedEpoch = {
  epochStart: number
  totalIncentivesUsd: number
  gaugeCount: number
  totalVemezoWeight: string
  totalVebtcWeight: string
  avgBoostMultiplier: number | null
}

function getCutoffEpoch(period: string): number {
  const now = Math.floor(Date.now() / 1000)
  if (period === "1m") return now - 30 * SECONDS_PER_DAY
  if (period === "3m") return now - 90 * SECONDS_PER_DAY
  return 0
}

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(request.url)
  const period = url.searchParams.get("period") ?? "all"
  const cutoffEpoch = getCutoffEpoch(period)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return json(
      {
        epochs: [],
        error: "missing-supabase-config",
        timestamp: Date.now(),
      },
      { status: 200 },
    )
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data, error } = await supabase
      .from("gauge_history")
      .select(
        "epoch_start, total_incentives_usd, vemezo_weight, vebtc_weight, gauge_address, boost_multiplier",
      )
      .gte("epoch_start", cutoffEpoch)
      .order("epoch_start", { ascending: true })

    if (error) {
      return json(
        {
          epochs: [],
          error: error.message,
          timestamp: Date.now(),
        },
        { status: 200 },
      )
    }

    const rows = (data ?? []) as unknown as GaugeHistoryRow[]

    // Aggregate per epoch_start.
    const byEpoch = new Map<
      number,
      {
        totalIncentivesUsd: number
        gaugeAddresses: Set<string>
        totalVemezoWeight: bigint
        totalVebtcWeight: bigint
        boostSum: number
        boostCount: number
      }
    >()

    for (const row of rows) {
      const existing = byEpoch.get(row.epoch_start) ?? {
        totalIncentivesUsd: 0,
        gaugeAddresses: new Set<string>(),
        totalVemezoWeight: 0n,
        totalVebtcWeight: 0n,
        boostSum: 0,
        boostCount: 0,
      }

      existing.totalIncentivesUsd += Number(row.total_incentives_usd ?? 0)
      existing.gaugeAddresses.add(row.gauge_address)
      if (row.vemezo_weight) {
        try {
          existing.totalVemezoWeight += BigInt(row.vemezo_weight)
        } catch {
          // Skip malformed bigint values.
        }
      }
      if (row.vebtc_weight) {
        try {
          existing.totalVebtcWeight += BigInt(row.vebtc_weight)
        } catch {
          // Skip malformed bigint values.
        }
      }
      if (row.boost_multiplier !== null) {
        existing.boostSum += Number(row.boost_multiplier)
        existing.boostCount += 1
      }

      byEpoch.set(row.epoch_start, existing)
    }

    const epochs: AggregatedEpoch[] = Array.from(byEpoch.entries())
      .sort(([a], [b]) => a - b)
      .map(([epochStart, agg]) => ({
        epochStart,
        totalIncentivesUsd: Number(agg.totalIncentivesUsd.toFixed(2)),
        gaugeCount: agg.gaugeAddresses.size,
        totalVemezoWeight: agg.totalVemezoWeight.toString(),
        totalVebtcWeight: agg.totalVebtcWeight.toString(),
        avgBoostMultiplier:
          agg.boostCount > 0 ? agg.boostSum / agg.boostCount : null,
      }))

    return json(
      {
        epochs,
        period,
        timestamp: Date.now(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return json(
      {
        epochs: [],
        error: message,
        timestamp: Date.now(),
      },
      { status: 200 },
    )
  }
}
