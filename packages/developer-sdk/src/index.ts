import { z } from "zod"

export type MatchboxClientOptions = {
  apiKey: string
  baseUrl?: string
  fetch?: typeof globalThis.fetch
}

export type GaugeRewardToken = {
  tokenAddress: string
  symbol: string
  decimals: number
  epochAmountRaw: string
  epochAmount: string
}

export type Gauge = {
  object: "gauge"
  id: string
  chainId: 31612
  gaugeAddress: string
  veBtcTokenId: string | null
  ownerAddress: string | null
  profile: {
    displayName: string | null
    avatarUrl: string | null
    description: string | null
    websiteUrl: string | null
    socialLinks: Record<string, string> | null
    incentiveStrategy: string | null
    votingStrategy: string | null
    tags: string[]
    featured: boolean
    updatedAt: string
  } | null
  state: {
    isAlive: boolean
    bribeAddress: string | null
    epochStart: string
    rewardTokens: GaugeRewardToken[]
  }
  generatedAt: string
}

export type MatchboxProfile = {
  object: "profile"
  walletAddress: string
  discord: {
    userId: string
    username: string | null
    displayName: string | null
    avatarUrl: string | null
  }
  verifiedAt: string
}

export type Authorization = {
  object: "authorization"
  walletAddress: string
  scopes: string[]
  profile: Omit<MatchboxProfile, "object" | "walletAddress">
}

export class MatchboxApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = "MatchboxApiError"
  }
}

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
})

const gaugeSchema = z.object({
  object: z.literal("gauge"),
  id: z.string(),
  chainId: z.literal(31612),
  gaugeAddress: z.string(),
  veBtcTokenId: z.string().nullable(),
  ownerAddress: z.string().nullable(),
  profile: z
    .object({
      displayName: z.string().nullable(),
      avatarUrl: z.string().nullable(),
      description: z.string().nullable(),
      websiteUrl: z.string().nullable(),
      socialLinks: z.record(z.string(), z.string()).nullable(),
      incentiveStrategy: z.string().nullable(),
      votingStrategy: z.string().nullable(),
      tags: z.array(z.string()),
      featured: z.boolean(),
      updatedAt: z.string(),
    })
    .nullable(),
  state: z.object({
    isAlive: z.boolean(),
    bribeAddress: z.string().nullable(),
    epochStart: z.string(),
    rewardTokens: z.array(
      z.object({
        tokenAddress: z.string(),
        symbol: z.string(),
        decimals: z.number(),
        epochAmountRaw: z.string(),
        epochAmount: z.string(),
      }),
    ),
  }),
  generatedAt: z.string(),
})

const discordSchema = z.object({
  userId: z.string(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
})

const profileSchema = z.object({
  object: z.literal("profile"),
  walletAddress: z.string(),
  discord: discordSchema,
  verifiedAt: z.string(),
})

const authorizationSchema = z.object({
  object: z.literal("authorization"),
  walletAddress: z.string(),
  scopes: z.array(z.string()),
  profile: z.object({ discord: discordSchema, verifiedAt: z.string() }),
})

export class MatchboxClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchImplementation: typeof globalThis.fetch

  constructor(options: MatchboxClientOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? "https://api.matchbox.markets").replace(
      /\/$/,
      "",
    )
    this.fetchImplementation = options.fetch ?? globalThis.fetch
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${this.apiKey}`)
    if (init.body) headers.set("Content-Type", "application/json")
    const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    })
    const body: unknown = await response.json()
    if (!response.ok) {
      const envelope = errorEnvelopeSchema.safeParse(body)
      throw new MatchboxApiError(
        envelope.success
          ? envelope.data.error.message
          : "Matchbox API request failed",
        response.status,
        envelope.success ? envelope.data.error.code : "unknown_error",
        (envelope.success ? envelope.data.error.requestId : undefined) ??
          response.headers.get("X-Request-Id"),
      )
    }
    return z.object({ data: schema }).parse(body).data
  }

  getGauge(gaugeAddress: string): Promise<Gauge> {
    return this.request(
      `/v1/gauges/${encodeURIComponent(gaugeAddress)}`,
      gaugeSchema,
    )
  }

  getGaugeByVeBtcToken(tokenId: bigint | string): Promise<Gauge> {
    return this.request(
      `/v1/vebtc/${encodeURIComponent(tokenId.toString())}/gauge`,
      gaugeSchema,
    )
  }

  getProfileByWallet(walletAddress: string): Promise<MatchboxProfile> {
    return this.request(
      `/v1/profiles/by-wallet/${encodeURIComponent(walletAddress)}`,
      profileSchema,
    )
  }

  exchangeAuthorization(input: {
    code: string
    redirectUri: string
  }): Promise<Authorization> {
    return this.request("/v1/authorizations/exchange", authorizationSchema, {
      method: "POST",
      body: JSON.stringify(input),
    })
  }
}
