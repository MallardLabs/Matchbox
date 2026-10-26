import { logger } from "@repo/logger"
import { buildErrorBody } from "@repo/platform-contracts/errors"
import {
  createDurableRateLimitClient,
  createSupabaseAdmin,
  flags,
  generateRequestId,
} from "@repo/platform-server"
import { type ApiApp, createApp } from "./app"
import { type WorkerEnv, memoryModePepper, parseWorkerEnv } from "./env"
import runHealthProbes from "./health/probes"
import { readReferencePrices } from "./market/prices"
import { type MarketReader, createViemMarketReader } from "./market/reader"
import {
  type MarketStore,
  createD1MarketStore,
  createMemoryMarketStore,
} from "./market/store"
import syncMarket from "./market/sync"
import {
  type ChainReader,
  createViemChainReader,
} from "./reconcile/chain-reader"
import reconcileChainState from "./reconcile/reconcile"
import type { ApiStore } from "./store/api-store"
import { devApiKeys } from "./store/memory-seed"
import { createMemoryApiStore } from "./store/memory-store"
import { createSupabaseApiStore } from "./store/supabase-store"

export { RateLimiter } from "@repo/platform-server/rate-limiter"

/** `name=value` lines (field names containing "secret" would be redacted). */
function devKeyLines(): string[] {
  return Object.entries(devApiKeys).map(([name, value]) => `${name}=${value}`)
}

type Runtime = {
  env: WorkerEnv
  store: ApiStore
  market: MarketStore | null
  app: ApiApp
}

function marketStoreFor(env: WorkerEnv): MarketStore | null {
  if (env.MARKET_DB !== undefined) return createD1MarketStore(env.MARKET_DB)
  return env.PLATFORM_STORE === "memory" ? createMemoryMarketStore() : null
}

type RuntimeResult = { ok: true; runtime: Runtime } | { ok: false }

let cached: { raw: unknown; runtime: Promise<RuntimeResult> } | null = null

async function buildRuntime(raw: unknown): Promise<RuntimeResult> {
  const parsed = parseWorkerEnv(raw)
  if (!parsed.ok) {
    logger.error({
      message: "Invalid Worker configuration",
      problems: parsed.problems,
    })
    return { ok: false }
  }
  const env = parsed.env
  const pepper = env.API_KEY_PEPPER ?? memoryModePepper
  let store: ApiStore
  if (env.PLATFORM_STORE === "memory") {
    store = await createMemoryApiStore({ pepper })
    logger.warn({
      message: "PLATFORM_STORE=memory: serving sample data with dev keys",
      environment: env.ENVIRONMENT,
      devKeys: devKeyLines(),
    })
  } else {
    store = createSupabaseApiStore({
      supabase: createSupabaseAdmin({
        SUPABASE_URL: env.SUPABASE_URL ?? "",
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      }),
      logger,
    })
  }
  const market = marketStoreFor(env)
  const app = createApp({
    store,
    market,
    rateLimits: createDurableRateLimitClient(env.RATE_LIMITER),
    analytics: env.REQUEST_LOG ?? null,
    now: () => new Date(),
    flags: { gaugeProfileApi: flags(env).gaugeProfileApi },
    config: {
      apiKeyPepper: pepper,
      version: env.API_VERSION,
      environment: env.ENVIRONMENT,
      ...(env.PUBLISHABLE_QUOTA_SHARE === null
        ? {}
        : { publishableQuotaShare: env.PUBLISHABLE_QUOTA_SHARE }),
    },

    logger,
  })
  return { ok: true, runtime: { env, store, market, app } }
}

/** Parses bindings once per isolate (rebuilt if the env object changes). */
function loadRuntime(raw: unknown): Promise<RuntimeResult> {
  if (cached === null || cached.raw !== raw) {
    cached = { raw, runtime: buildRuntime(raw) }
  }
  return cached.runtime
}

function misconfigured(): Response {
  const requestId = generateRequestId()
  return Response.json(buildErrorBody({ code: "internal_error", requestId }), {
    status: 500,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  })
}

function chainReaders(
  env: WorkerEnv,
): Partial<Record<"mezo" | "mezo-testnet", ChainReader>> {
  const readers: Partial<Record<"mezo" | "mezo-testnet", ChainReader>> = {}
  if (env.MEZO_MAINNET_RPC_URL !== null) {
    readers.mezo = createViemChainReader("mezo", env.MEZO_MAINNET_RPC_URL)
  }
  if (env.MEZO_TESTNET_RPC_URL !== null) {
    readers["mezo-testnet"] = createViemChainReader(
      "mezo-testnet",
      env.MEZO_TESTNET_RPC_URL,
    )
  }
  return readers
}

function marketReaders(
  env: WorkerEnv,
): Partial<Record<"mezo" | "mezo-testnet", MarketReader>> {
  const readers: Partial<Record<"mezo" | "mezo-testnet", MarketReader>> = {}
  if (env.MEZO_MAINNET_RPC_URL !== null) {
    readers.mezo = createViemMarketReader("mezo", env.MEZO_MAINNET_RPC_URL)
  }
  if (env.MEZO_TESTNET_RPC_URL !== null) {
    readers["mezo-testnet"] = createViemMarketReader(
      "mezo-testnet",
      env.MEZO_TESTNET_RPC_URL,
    )
  }
  return readers
}

/** `triggers.crons` in wrangler.jsonc; each schedule runs one task. */
export const healthProbeCron = "* * * * *"
export const reconcileCron = "*/10 * * * *"
export const marketCron = "*/5 * * * *"

async function runHealthCheck(raw: unknown): Promise<void> {
  try {
    const loaded = await loadRuntime(raw)
    if (!loaded.ok) return
    const { env, store } = loaded.runtime
    const readers = chainReaders(env)
    await runHealthProbes({
      fetch: (input, init) => fetch(input, init),
      apiHealthUrl: env.HEALTH_API_URL,
      idDiscoveryUrl: env.HEALTH_ID_URL,
      latestChainSync: (network) => store.latestChainSync(network),
      headBlock: async (network) => {
        const reader = readers[network]
        return reader === undefined ? null : reader.blockNumber()
      },
      deployment: env.ENVIRONMENT,
      now: () => new Date(),
      sink: env.HEALTH_LOG ?? null,
      logger: logger.child({ task: "health-probes" }),
    })
  } catch (error) {
    logger.error({ message: "Scheduled health probes crashed", error })
  }
}

async function runReconciliation(raw: unknown): Promise<void> {
  try {
    const loaded = await loadRuntime(raw)
    if (!loaded.ok) return
    await reconcileChainState({
      store: loaded.runtime.store,
      readers: chainReaders(loaded.runtime.env),
      now: () => new Date(),
      logger: logger.child({ task: "reconcile-chain-state" }),
    })
  } catch (error) {
    logger.error({ message: "Scheduled reconciliation crashed", error })
  }
}

/** Boost gauge → veBTC token id from curated profiles on `network`. */
async function profileBoostTokens(
  store: ApiStore,
  network: "mezo" | "mezo-testnet",
): Promise<Map<string, string>> {
  const targets = await store.listProfilesForReconciliation()
  const tokens = new Map<string, string>()
  for (const target of targets) {
    if (
      target.network === network &&
      target.profileType === "boost-gauge" &&
      target.vebtcTokenId !== null
    ) {
      tokens.set(target.gaugeAddress, target.vebtcTokenId)
    }
  }
  return tokens
}

async function runMarketSync(raw: unknown): Promise<void> {
  try {
    const loaded = await loadRuntime(raw)
    if (!loaded.ok) return
    const { env, store, market } = loaded.runtime
    if (market === null) return
    await syncMarket({
      store: market,
      readers: marketReaders(env),
      readPrices: () =>
        readReferencePrices({
          mezoMainnetRpcUrl: env.MEZO_MAINNET_RPC_URL,
          baseRpcUrl: env.BASE_RPC_URL,
          logger: logger.child({ task: "market-prices" }),
        }),
      profileBoostTokens: (network) => profileBoostTokens(store, network),
      now: () => new Date(),
      logger: logger.child({ task: "market-snapshot" }),
    })
  } catch (error) {
    logger.error({ message: "Scheduled market snapshot crashed", error })
  }
}

export default {
  async fetch(
    request: Request,
    env: unknown,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const loaded = await loadRuntime(env)
    if (!loaded.ok) return misconfigured()
    return loaded.runtime.app.fetch(request, env, ctx)
  },

  async scheduled(
    controller: ScheduledController,
    env: unknown,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (controller.cron === healthProbeCron) {
      ctx.waitUntil(runHealthCheck(env))
      return
    }
    if (controller.cron === marketCron) {
      ctx.waitUntil(runMarketSync(env))
      return
    }
    ctx.waitUntil(runReconciliation(env))
  },
} satisfies ExportedHandler<unknown>
