import { logger } from "@repo/logger"
import type { NetworkSlug } from "@repo/platform-contracts/network"
import {
  createDurableRateLimitClient,
  createSupabaseAdmin,
} from "@repo/platform-server"
import type { Hono } from "hono"
import { http, createPublicClient, defineChain } from "viem"
import { createApp, createDisabledApp } from "./app"
import { purgeExpiredRows } from "./cleanup"
import {
  type WorkerConfig,
  type WorkerEnv,
  idFlags,
  parseWorkerConfig,
} from "./config"
import type { SiwePublicClient } from "./deps"
import { createSigningKeys } from "./oidc/keys"
import type { IdStore } from "./store/id-store"
import { createMemoryIdStore } from "./store/memory-store"
import createSupabaseIdStore from "./store/supabase-store"

export { RateLimiter } from "@repo/platform-server/rate-limiter"

const workerPathPrefixes = ["/api/", "/oauth/", "/.well-known/"]

const mezoChains = {
  mezo: { id: 31612, name: "Mezo" },
  "mezo-testnet": { id: 31611, name: "Mezo Testnet" },
} as const satisfies Record<NetworkSlug, { id: number; name: string }>

function publicClientFactory(
  config: WorkerConfig,
): (network: NetworkSlug) => SiwePublicClient {
  const clients = new Map<NetworkSlug, SiwePublicClient>()
  return function publicClientFor(network) {
    const cached = clients.get(network)
    if (cached !== undefined) return cached
    const rpcUrl =
      network === "mezo"
        ? config.MEZO_MAINNET_RPC_URL
        : config.MEZO_TESTNET_RPC_URL
    const chain = defineChain({
      ...mezoChains[network],
      nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    })
    const client = createPublicClient({ chain, transport: http(rpcUrl) })
    clients.set(network, client)
    return client
  }
}

function supabaseStore(
  config: Extract<WorkerConfig, { PLATFORM_STORE: "supabase" }>,
): IdStore {
  return createSupabaseIdStore(
    createSupabaseAdmin({
      SUPABASE_URL: config.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: config.SUPABASE_SERVICE_ROLE_KEY,
    }),
  )
}

function enabledConfig(env: WorkerEnv): WorkerConfig | null {
  if (!idFlags(env).matchboxId) return null
  const parsed = parseWorkerConfig(env)
  if (!parsed.ok) {
    logger.error({
      message: "Invalid Matchbox ID configuration",
      issues: parsed.issues,
    })
    return null
  }
  return parsed.config
}

async function buildApp(env: WorkerEnv): Promise<Hono> {
  const flags = idFlags(env)
  const config = enabledConfig(env)
  if (config === null) return createDisabledApp({ logger })
  let store: IdStore
  if (config.PLATFORM_STORE === "memory") {
    logger.warn({ message: "Using the in-memory Matchbox ID store" })
    store = await createMemoryIdStore({
      clientSecretPepper: config.CLIENT_SECRET_PEPPER,
    })
  } else {
    store = supabaseStore(config)
  }
  return createApp({
    store,
    rateLimits: createDurableRateLimitClient(env.RATE_LIMITER),
    keys: await createSigningKeys(config.OIDC_SIGNING_KEYS),
    now: () => new Date(),
    flags,
    config: {
      issuer: config.ISSUER.replace(/\/+$/, ""),
      sessionPepper: config.SESSION_PEPPER,
      clientSecretPepper: config.CLIENT_SECRET_PEPPER,
    },
    publicClientFactory: publicClientFactory(config),
    logger,
  })
}

// One app per isolate and configuration (the memory store must survive
// requests, and `env` identity is not guaranteed across requests).
let cached: { key: string; app: Promise<Hono> } | null = null

function configKey(env: WorkerEnv): string {
  return Object.entries(env)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, value]) => `${name}=${value}`)
    .sort()
    .join("|")
}

function appFor(env: WorkerEnv): Promise<Hono> {
  const key = configKey(env)
  if (cached !== null && cached.key === key) return cached.app
  const app = buildApp(env)
  cached = { key, app }
  app.catch(() => {
    if (cached?.app === app) cached = null
  })
  return app
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (!workerPathPrefixes.some((prefix) => pathname.startsWith(prefix))) {
      return env.ASSETS.fetch(request)
    }
    const app = await appFor(env)
    return app.fetch(request, env, ctx)
  },

  async scheduled(controller, env, ctx): Promise<void> {
    const config = enabledConfig(env)
    // The memory store lives in the fetch isolate's app; nothing to purge.
    if (config === null || config.PLATFORM_STORE === "memory") return
    ctx.waitUntil(
      purgeExpiredRows(
        supabaseStore(config),
        new Date(controller.scheduledTime),
        logger,
      ).catch((error: unknown) => {
        logger.error({ message: "Matchbox ID cleanup failed", error })
      }),
    )
  },
} satisfies ExportedHandler<WorkerEnv>
