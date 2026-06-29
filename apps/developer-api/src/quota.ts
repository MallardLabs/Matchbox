import type {
  Request as CloudflareRequest,
  DurableObjectState,
} from "@cloudflare/workers-types"
import { z } from "zod"
import type { ApiKeyContext, Environment } from "./types"

const quotaRequestSchema = z.object({
  bucket: z.enum(["gauge", "profile"]),
  minuteLimit: z.number().int().positive(),
  dayLimit: z.number().int().positive(),
})

type StoredCounter = { window: number; count: number }

export class ApiQuotaLimiter {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: CloudflareRequest): Promise<Response> {
    const parsedBody = quotaRequestSchema.safeParse(await request.json())
    if (!parsedBody.success)
      return new Response("Invalid quota request", { status: 400 })

    const now = Date.now()
    const minuteWindow = Math.floor(now / 60_000)
    const dayWindow = Math.floor(now / 86_400_000)
    const minuteKey = `${parsedBody.data.bucket}:minute`
    const dayKey = `${parsedBody.data.bucket}:day`

    const [storedMinute, storedDay] = await Promise.all([
      this.state.storage.get<StoredCounter>(minuteKey),
      this.state.storage.get<StoredCounter>(dayKey),
    ])
    const minute =
      storedMinute?.window === minuteWindow
        ? storedMinute
        : { window: minuteWindow, count: 0 }
    const day =
      storedDay?.window === dayWindow
        ? storedDay
        : { window: dayWindow, count: 0 }

    const allowed =
      minute.count < parsedBody.data.minuteLimit &&
      day.count < parsedBody.data.dayLimit

    if (allowed) {
      minute.count += 1
      day.count += 1
      await Promise.all([
        this.state.storage.put(minuteKey, minute),
        this.state.storage.put(dayKey, day),
      ])
    }

    const resetSeconds = 60 - Math.floor((now % 60_000) / 1000)
    return Response.json({
      allowed,
      limit: parsedBody.data.minuteLimit,
      remaining: Math.max(parsedBody.data.minuteLimit - minute.count, 0),
      resetSeconds,
    })
  }
}

const quotaResultSchema = z.object({
  allowed: z.boolean(),
  limit: z.number().int(),
  remaining: z.number().int(),
  resetSeconds: z.number().int(),
})

export async function consumeQuota(
  environment: Environment,
  context: ApiKeyContext,
  bucket: "gauge" | "profile",
) {
  const minuteLimit =
    bucket === "gauge"
      ? context.app.gaugeRequestsPerMinute
      : context.app.profileRequestsPerMinute
  const dayLimit =
    bucket === "gauge"
      ? context.app.gaugeRequestsPerDay
      : context.app.profileRequestsPerDay
  const id = environment.API_QUOTAS.idFromName(context.keyId)
  const response = await environment.API_QUOTAS.get(id).fetch(
    "https://quota/consume",
    {
      method: "POST",
      body: JSON.stringify({ bucket, minuteLimit, dayLimit }),
    },
  )
  return quotaResultSchema.parse(await response.json())
}
