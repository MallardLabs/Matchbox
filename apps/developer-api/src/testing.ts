import { type Logger, createLogger } from "@repo/logger"
import {
  type ApiKeyKind,
  formatApiKey,
} from "@repo/platform-contracts/credentials"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import { createMemoryRateLimitClient } from "@repo/platform-server"
import { type ApiApp, createApp } from "./app"
import type { RequestLogSink } from "./middleware/request-log"
import { defaultMemorySeed } from "./store/memory-seed"
import {
  type MemoryApiKey,
  type MemoryApiStore,
  type MemoryStoreSeed,
  createMemoryApiStore,
} from "./store/memory-store"

/** Shared fixtures for app-level tests (never imported by the Worker). */

export const testPepper = "test-pepper-0123456789-abcdefghijklmnop"

export const testOrigin = "http://localhost:5173"
export const liveOrigin = "https://app.example.com"

export const ids = {
  activeApp: "10000000-0000-4000-8000-000000000001",
  restrictedApp: "10000000-0000-4000-8000-000000000002",
  suspendedApp: "10000000-0000-4000-8000-000000000003",
  testEnv: "20000000-0000-4000-8000-000000000001",
  liveEnv: "20000000-0000-4000-8000-000000000002",
  liveUnapprovedEnv: "20000000-0000-4000-8000-000000000003",
  restrictedLiveEnv: "20000000-0000-4000-8000-000000000004",
  suspendedTestEnv: "20000000-0000-4000-8000-000000000005",
  liveNoScopeEnv: "20000000-0000-4000-8000-000000000006",
} as const

function key(
  kind: ApiKeyKind,
  environmentKind: EnvironmentKind,
  prefix: string,
): string {
  return formatApiKey({
    kind,
    environmentKind,
    prefix,
    secret: `${prefix}${"s".repeat(43)}`.slice(0, 43),
  })
}

export const keys = {
  pkTest: key("publishable", "test", "PkTest000001"),
  skTest: key("secret", "test", "SkTest000001"),
  skTestCidr: key("secret", "test", "SkTestCidr01"),
  skRevoked: key("secret", "test", "SkRevoked001"),
  skExpired: key("secret", "test", "SkExpired001"),
  skFutureExpiry: key("secret", "test", "SkFuture0001"),
  pkLive: key("publishable", "live", "PkLive000001"),
  skLive: key("secret", "live", "SkLive000001"),
  skLiveUnapproved: key("secret", "live", "SkLiveUnap01"),
  skLiveNoScope: key("secret", "live", "SkLiveNoSc01"),
  skRestrictedLive: key("secret", "live", "SkRestrict01"),
  skSuspended: key("secret", "test", "SkSuspend001"),
} as const

export const keyIds = {
  pkTest: "30000000-0000-4000-8000-000000000001",
  skTest: "30000000-0000-4000-8000-000000000002",
  skTestCidr: "30000000-0000-4000-8000-000000000003",
  skRevoked: "30000000-0000-4000-8000-000000000004",
  skExpired: "30000000-0000-4000-8000-000000000005",
  skFutureExpiry: "30000000-0000-4000-8000-000000000006",
  pkLive: "30000000-0000-4000-8000-000000000007",
  skLive: "30000000-0000-4000-8000-000000000008",
  skLiveUnapproved: "30000000-0000-4000-8000-000000000009",
  skLiveNoScope: "30000000-0000-4000-8000-000000000010",
  skRestrictedLive: "30000000-0000-4000-8000-000000000011",
  skSuspended: "30000000-0000-4000-8000-000000000012",
} as const satisfies Record<keyof typeof keys, string>

type KeyName = keyof typeof keys

function apiKey(
  name: KeyName,
  environmentId: string,
  overrides: Partial<Omit<MemoryApiKey, "id" | "value">> = {},
): MemoryApiKey {
  return {
    id: keyIds[name],
    environmentId,
    kind: keys[name].startsWith("mbx_pk_") ? "publishable" : "secret",
    value: keys[name],
    allowedCidrs: [],
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  }
}

export const testSeed: MemoryStoreSeed = {
  apps: [
    { id: ids.activeApp, status: "active" },
    { id: ids.restrictedApp, status: "restricted" },
    { id: ids.suspendedApp, status: "suspended" },
  ],
  environments: [
    {
      id: ids.testEnv,
      appId: ids.activeApp,
      kind: "test",
      network: "mezo-testnet",
      reviewState: "development",
      approvedScopes: [],
      origins: [testOrigin],
    },
    {
      id: ids.liveEnv,
      appId: ids.activeApp,
      kind: "live",
      network: "mezo",
      reviewState: "approved",
      approvedScopes: ["gauge-profiles:read"],
      origins: [liveOrigin],
    },
    {
      id: ids.liveUnapprovedEnv,
      appId: ids.activeApp,
      kind: "live",
      network: "mezo",
      reviewState: "submitted",
      approvedScopes: [],
      origins: [],
    },
    {
      id: ids.liveNoScopeEnv,
      appId: ids.activeApp,
      kind: "live",
      network: "mezo",
      reviewState: "approved",
      approvedScopes: ["openid"],
      origins: [],
    },
    {
      id: ids.restrictedLiveEnv,
      appId: ids.restrictedApp,
      kind: "live",
      network: "mezo",
      reviewState: "approved",
      approvedScopes: ["gauge-profiles:read"],
      origins: [],
    },
    {
      id: ids.suspendedTestEnv,
      appId: ids.suspendedApp,
      kind: "test",
      network: "mezo-testnet",
      reviewState: "development",
      approvedScopes: [],
      origins: [],
    },
  ],
  apiKeys: [
    apiKey("pkTest", ids.testEnv),
    apiKey("skTest", ids.testEnv),
    apiKey("skTestCidr", ids.testEnv, { allowedCidrs: ["203.0.113.0/24"] }),
    apiKey("skRevoked", ids.testEnv, { revokedAt: "2026-09-01T00:00:00Z" }),
    apiKey("skExpired", ids.testEnv, { expiresAt: "2026-09-29T00:00:00Z" }),
    apiKey("skFutureExpiry", ids.testEnv, {
      expiresAt: "2026-12-31T00:00:00Z",
    }),
    apiKey("pkLive", ids.liveEnv),
    apiKey("skLive", ids.liveEnv),
    apiKey("skLiveUnapproved", ids.liveUnapprovedEnv),
    apiKey("skLiveNoScope", ids.liveNoScopeEnv),
    apiKey("skRestrictedLive", ids.restrictedLiveEnv),
    apiKey("skSuspended", ids.suspendedTestEnv),
  ],
  profiles: defaultMemorySeed.profiles,
  vebtcTokens: defaultMemorySeed.vebtcTokens,
  quotaOverrides: [],
}

export type Clock = { now: Date; advance(ms: number): void }

export function createClock(start = "2026-09-30T12:00:00.000Z"): Clock {
  const clock: Clock = {
    now: new Date(start),
    advance(ms) {
      clock.now = new Date(clock.now.getTime() + ms)
    },
  }
  return clock
}

export type DataPoint = {
  indexes: string[]
  blobs: string[]
  doubles: number[]
}

export type TestHarness = {
  app: ApiApp
  store: MemoryApiStore
  clock: Clock
  dataPoints: DataPoint[]
  /** GET with a bearer key; `headers` override defaults. */
  get(
    path: string,
    options?: {
      key?: string | null
      origin?: string
      ip?: string
      headers?: Record<string, string>
    },
  ): Promise<Response>
}

export const silentLogger: Logger = createLogger({
  sink: () => undefined,
  level: "error",
})

export async function createHarness(
  options: {
    seed?: MemoryStoreSeed
    gaugeProfileApi?: boolean
    publishableQuotaShare?: number
  } = {},
): Promise<TestHarness> {
  const clock = createClock()
  const store = await createMemoryApiStore({
    pepper: testPepper,
    seed: options.seed ?? testSeed,
  })
  const dataPoints: DataPoint[] = []
  const sink: RequestLogSink = {
    writeDataPoint(point) {
      dataPoints.push(point)
    },
  }
  const app = createApp({
    store,
    rateLimits: createMemoryRateLimitClient(() => clock.now.getTime()),
    analytics: sink,
    now: () => clock.now,
    flags: { gaugeProfileApi: options.gaugeProfileApi ?? true },
    config: {
      apiKeyPepper: testPepper,
      version: "2.0.0-test",
      environment: "test",
      ...(options.publishableQuotaShare === undefined
        ? {}
        : { publishableQuotaShare: options.publishableQuotaShare }),
    },

    logger: silentLogger,
  })
  return {
    app,
    store,
    clock,
    dataPoints,
    get(path, requestOptions = {}) {
      const headers: Record<string, string> = {
        "CF-Connecting-IP": requestOptions.ip ?? "198.51.100.7",
      }
      const presented =
        requestOptions.key === undefined ? keys.skTest : requestOptions.key
      if (presented !== null) headers.Authorization = `Bearer ${presented}`
      if (requestOptions.origin !== undefined) {
        headers.Origin = requestOptions.origin
      }
      return Promise.resolve(
        app.request(path, {
          headers: { ...headers, ...requestOptions.headers },
        }),
      )
    },
  }
}
