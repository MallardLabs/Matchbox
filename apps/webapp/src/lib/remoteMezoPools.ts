import { z } from "zod"

const geckoUsd = z
  .string()
  .nullable()
  .optional()
  .transform((value, context) => {
    if (value == null || value === "") return null
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
          reserve_in_usd: geckoUsd,
          volume_usd: z
            .object({
              h24: geckoUsd,
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
})

export type RemotePoolStat = {
  venueName: string | null
  reserveUsd: number | null
  volume24hUsd: number | null
}

export function parseGeckoPoolResponse(payload: unknown): RemotePoolStat {
  const parsed = geckoPoolResponseSchema.safeParse(payload)
  if (!parsed.success) {
    return { venueName: null, reserveUsd: null, volume24hUsd: null }
  }
  const attributes = parsed.data.data?.attributes
  return {
    venueName: attributes?.name?.trim() || null,
    reserveUsd: attributes?.reserve_in_usd ?? null,
    volume24hUsd: attributes?.volume_usd?.h24 ?? null,
  }
}

export function geckoPoolRequestPath(
  network: "base" | "eth",
  poolId: string,
): string {
  return `/networks/${network}/pools/${poolId}`
}
