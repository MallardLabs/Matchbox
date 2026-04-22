import { createClient } from "@supabase/supabase-js"

export const config = {
  runtime: "edge",
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

const DEFAULT_EPOCH_LIMIT = 12
const MAX_EPOCH_LIMIT = 52

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
  gauge_address: string
  vemezo_weight: string | null
  vebtc_weight: string | null
  total_incentives_usd: number | null
  boost_multiplier: number | null
}

type GaugeVoteRow = {
  gaugeAddress: string
  vemezoWeight: string
  vebtcWeight: string
  totalIncentivesUsd: number
  boostMultiplier: number | null
}

type EpochVotesBundle = {
  epochStart: number
  totalVemezoWeight: string
  totalVebtcWeight: string
  totalIncentivesUsd: number
  gauges: GaugeVoteRow[]
}

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(request.url)
  const rawLimit = Number(url.searchParams.get("limit") ?? DEFAULT_EPOCH_LIMIT)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(1, Math.floor(rawLimit)), MAX_EPOCH_LIMIT)
    : DEFAULT_EPOCH_LIMIT

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

    // First: find the most recent N distinct epoch_start values.
    const { data: epochRows, error: epochError } = await supabase
      .from("gauge_history")
      .select("epoch_start")
      .order("epoch_start", { ascending: false })
      .limit(limit * 400) // Heuristic: ~400 gauges * N epochs upper bound.

    if (epochError) {
      return json(
        {
          epochs: [],
          error: epochError.message,
          timestamp: Date.now(),
        },
        { status: 200 },
      )
    }

    const recentEpochs = Array.from(
      new Set(
        ((epochRows ?? []) as unknown as { epoch_start: number }[]).map(
          (row) => row.epoch_start,
        ),
      ),
    )
      .sort((a, b) => b - a)
      .slice(0, limit)

    if (recentEpochs.length === 0) {
      return json(
        {
          epochs: [],
          timestamp: Date.now(),
        },
        { status: 200 },
      )
    }

    const minEpoch = Math.min(...recentEpochs)

    const { data, error } = await supabase
      .from("gauge_history")
      .select(
        "epoch_start, gauge_address, vemezo_weight, vebtc_weight, total_incentives_usd, boost_multiplier",
      )
      .gte("epoch_start", minEpoch)
      .order("epoch_start", { ascending: false })

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
    const epochSet = new Set(recentEpochs)

    const byEpoch = new Map<
      number,
      {
        totalVemezoWeight: bigint
        totalVebtcWeight: bigint
        totalIncentivesUsd: number
        gauges: Map<string, GaugeVoteRow>
      }
    >()

    for (const row of rows) {
      if (!epochSet.has(row.epoch_start)) continue

      const bucket = byEpoch.get(row.epoch_start) ?? {
        totalVemezoWeight: 0n,
        totalVebtcWeight: 0n,
        totalIncentivesUsd: 0,
        gauges: new Map<string, GaugeVoteRow>(),
      }

      let vemezoBig = 0n
      if (row.vemezo_weight) {
        try {
          vemezoBig = BigInt(row.vemezo_weight)
        } catch {
          // skip malformed
        }
      }

      let vebtcBig = 0n
      if (row.vebtc_weight) {
        try {
          vebtcBig = BigInt(row.vebtc_weight)
        } catch {
          // skip malformed
        }
      }

      const incentives = Number(row.total_incentives_usd ?? 0)

      bucket.totalVemezoWeight += vemezoBig
      bucket.totalVebtcWeight += vebtcBig
      bucket.totalIncentivesUsd += incentives

      const gaugeKey = row.gauge_address.toLowerCase()
      const existing = bucket.gauges.get(gaugeKey)
      if (existing) {
        // Should not happen: one row per (gauge, epoch). If it does, sum defensively.
        existing.vemezoWeight = (
          BigInt(existing.vemezoWeight) + vemezoBig
        ).toString()
        existing.vebtcWeight = (
          BigInt(existing.vebtcWeight) + vebtcBig
        ).toString()
        existing.totalIncentivesUsd += incentives
      } else {
        bucket.gauges.set(gaugeKey, {
          gaugeAddress: gaugeKey,
          vemezoWeight: vemezoBig.toString(),
          vebtcWeight: vebtcBig.toString(),
          totalIncentivesUsd: Number(incentives.toFixed(2)),
          boostMultiplier: row.boost_multiplier,
        })
      }

      byEpoch.set(row.epoch_start, bucket)
    }

    const epochs: EpochVotesBundle[] = Array.from(byEpoch.entries())
      .sort(([a], [b]) => b - a)
      .map(([epochStart, bucket]) => ({
        epochStart,
        totalVemezoWeight: bucket.totalVemezoWeight.toString(),
        totalVebtcWeight: bucket.totalVebtcWeight.toString(),
        totalIncentivesUsd: Number(bucket.totalIncentivesUsd.toFixed(2)),
        gauges: Array.from(bucket.gauges.values()),
      }))

    return json(
      {
        epochs,
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
