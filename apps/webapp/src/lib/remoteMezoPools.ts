import { z } from "zod"

const usdAmount = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((value, context) => {
    if (value == null || value === "") return null
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "USD amount is not a finite number",
        })
        return z.NEVER
      }
      return value
    }
    if (!/^\d+(\.\d+)?$/.test(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expected a non-negative decimal string",
      })
      return z.NEVER
    }
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "USD amount is not a finite number",
      })
      return z.NEVER
    }
    return parsed
  })

export const geckoPoolResponseSchema = z.object({
  data: z
    .object({
      attributes: z
        .object({
          name: z.string().optional(),
          reserve_in_usd: usdAmount,
          volume_usd: z
            .object({
              h24: usdAmount,
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
})

const dexScreenerPairSchema = z.object({
  baseToken: z.object({ symbol: z.string().optional() }).optional(),
  quoteToken: z.object({ symbol: z.string().optional() }).optional(),
  liquidity: z.object({ usd: usdAmount }).optional(),
  volume: z.object({ h24: usdAmount }).optional(),
})

export const dexScreenerResponseSchema = z.object({
  pair: dexScreenerPairSchema.nullable().optional(),
  pairs: z.array(dexScreenerPairSchema).nullable().optional(),
})

const curveVolumePoolSchema = z.object({
  address: z.string(),
  volumeUSD: usdAmount,
})

export const curveVolumesResponseSchema = z.object({
  data: z
    .object({
      pools: z.array(curveVolumePoolSchema).optional(),
    })
    .optional(),
})

const curveFactoryPoolSchema = z.object({
  address: z.string(),
  name: z.string().optional(),
  usdTotal: usdAmount,
})

export const curveFactoryPoolsResponseSchema = z.object({
  data: z
    .object({
      poolData: z.array(curveFactoryPoolSchema).optional(),
    })
    .optional(),
})

export type RemotePoolStat = {
  venueName: string | null
  reserveUsd: number | null
  volume24hUsd: number | null
}

export function emptyRemotePoolStat(): RemotePoolStat {
  return { venueName: null, reserveUsd: null, volume24hUsd: null }
}

export function mergeRemotePoolStats(
  parts: readonly RemotePoolStat[],
): RemotePoolStat {
  return {
    venueName: parts.find((part) => part.venueName)?.venueName ?? null,
    reserveUsd:
      parts.find((part) => part.reserveUsd != null)?.reserveUsd ?? null,
    volume24hUsd:
      parts.find((part) => part.volume24hUsd != null)?.volume24hUsd ?? null,
  }
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

export function parseGeckoPoolResponse(payload: unknown): RemotePoolStat {
  const parsed = geckoPoolResponseSchema.safeParse(payload)
  if (!parsed.success) return emptyRemotePoolStat()
  const attributes = parsed.data.data?.attributes
  return {
    venueName: attributes?.name?.trim() || null,
    reserveUsd: attributes?.reserve_in_usd ?? null,
    volume24hUsd: attributes?.volume_usd?.h24 ?? null,
  }
}

export function parseDexScreenerResponse(payload: unknown): RemotePoolStat {
  const parsed = dexScreenerResponseSchema.safeParse(payload)
  if (!parsed.success) return emptyRemotePoolStat()
  const pair = parsed.data.pair ?? parsed.data.pairs?.[0]
  if (!pair) return emptyRemotePoolStat()
  const base = pair.baseToken?.symbol?.trim()
  const quote = pair.quoteToken?.symbol?.trim()
  return {
    venueName: base && quote ? `${base} / ${quote}` : null,
    reserveUsd: pair.liquidity?.usd ?? null,
    volume24hUsd: pair.volume?.h24 ?? null,
  }
}

export function parseCurveVolume(
  payload: unknown,
  poolAddress: string,
): RemotePoolStat {
  const parsed = curveVolumesResponseSchema.safeParse(payload)
  const pool = parsed.success
    ? parsed.data.data?.pools?.find((item) =>
        sameAddress(item.address, poolAddress),
      )
    : undefined
  return {
    venueName: null,
    reserveUsd: null,
    volume24hUsd: pool?.volumeUSD ?? null,
  }
}

export function parseCurveFactoryTvl(
  payload: unknown,
  poolAddress: string,
): RemotePoolStat {
  const parsed = curveFactoryPoolsResponseSchema.safeParse(payload)
  const pool = parsed.success
    ? parsed.data.data?.poolData?.find((item) =>
        sameAddress(item.address, poolAddress),
      )
    : undefined
  return {
    venueName: pool?.name?.trim() || null,
    reserveUsd: pool?.usdTotal ?? null,
    volume24hUsd: null,
  }
}

export function geckoPoolRequestPath(
  network: "base" | "eth",
  poolId: string,
): string {
  return `/networks/${network}/pools/${poolId}`
}

export function dexScreenerPairRequestPath(
  chain: "base" | "ethereum",
  pairId: string,
): string {
  return `/latest/dex/pairs/${chain}/${pairId}`
}
