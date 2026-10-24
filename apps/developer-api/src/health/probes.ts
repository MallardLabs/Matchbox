import type { Logger } from "@repo/logger"
import { decimalStringSchema } from "@repo/platform-contracts/common"
import { parseJson } from "@repo/platform-contracts/encoding"
import { errorBodySchema } from "@repo/platform-contracts/errors"
import { healthResponseSchema } from "@repo/platform-contracts/gauge-profiles"
import {
  type NetworkSlug,
  networkSlugSchema,
} from "@repo/platform-contracts/network"
import { discoveryDocumentSchema } from "@repo/platform-contracts/oidc"
import {
  type HealthProbe,
  type HealthProbeErrorCode,
  type HealthProbeOutcome,
  chainSyncOutcome,
  chainSyncTarget,
  healthProbeDataPoint,
  healthProbeThresholds,
  httpProbeOutcome,
} from "@repo/platform-contracts/platform-health"
import type { ChainSyncSnapshot } from "../store/api-store"

/**
 * The 1-minute health cron: probes the Gauge Profile API's public
 * `/v1/health`, Matchbox ID's discovery document and each network's
 * chain-state freshness, then writes one `mbx_platform_health` data point
 * per probe (layout in `@repo/platform-contracts/platform-health`). The
 * console reads them back for uptime, latency and freshness. A target
 * without a configured URL is skipped (the console shows it as unknown).
 */

export type HealthProbeSink = {
  writeDataPoint(point: {
    indexes: string[]
    blobs: string[]
    doubles: number[]
  }): void
}

export type HealthProbeDeps = {
  fetch: typeof fetch
  /** Public `/v1/health` URL of this API; null skips the probe. */
  apiHealthUrl: string | null
  /** Matchbox ID discovery URL; null skips the probe. */
  idDiscoveryUrl: string | null
  latestChainSync(network: NetworkSlug): Promise<ChainSyncSnapshot>
  /** RPC head per network; null when no reader is configured. */
  headBlock(network: NetworkSlug): Promise<bigint | null>
  /** Worker `ENVIRONMENT`, so deployments sharing the dataset stay apart. */
  deployment: string
  now: () => Date
  sink: HealthProbeSink | null
  logger: Logger
}

type HttpCheck = {
  outcome: HealthProbeOutcome
  errorCode: HealthProbeErrorCode | null
  latencyMs: number
  httpStatus: number
  body: unknown
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  )
}

/** Error code of a platform error body, if the response carries one. */
function platformErrorCode(body: unknown): string | null {
  const parsed = errorBodySchema.safeParse(body)
  return parsed.success ? parsed.data.error.code : null
}

async function checkHttp(
  deps: HealthProbeDeps,
  url: string,
): Promise<HttpCheck> {
  const started = Date.now()
  try {
    const response = await deps.fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "matchbox-health-probe",
      },
      signal: AbortSignal.timeout(healthProbeThresholds.timeoutMs),
    })
    const text = await response.text()
    const latencyMs = Date.now() - started
    const json = parseJson(text)
    const body = json.ok ? json.value : null
    if (!response.ok && platformErrorCode(body) === "service_disabled") {
      return {
        outcome: "down",
        errorCode: "service-disabled",
        latencyMs,
        httpStatus: response.status,
        body,
      }
    }
    return {
      ...httpProbeOutcome({ ok: response.ok, latencyMs }),
      latencyMs,
      httpStatus: response.status,
      body,
    }
  } catch (error) {
    return {
      outcome: "down",
      errorCode: isTimeout(error) ? "timeout" : "network-error",
      latencyMs: Date.now() - started,
      httpStatus: 0,
      body: null,
    }
  }
}

const emptyChainFields = {
  network: null,
  blockNumber: null,
  chainCheckedAt: null,
  headBlock: null,
  lagSeconds: -1,
  blocksBehind: -1,
} as const

async function probeApi(
  deps: HealthProbeDeps,
  url: string,
): Promise<HealthProbe> {
  const check = await checkHttp(deps, url)
  let { outcome, errorCode } = check
  let version: string | null = null
  if (outcome !== "down") {
    const health = healthResponseSchema.safeParse(check.body)
    if (!health.success) {
      outcome = "down"
      errorCode = "invalid-body"
    } else if (!health.data.flags.gaugeProfileApi) {
      // `/v1/health` stays up with the kill switch off; `/v1/*` answers 503.
      outcome = "down"
      errorCode = "service-disabled"
      version = health.data.version
    } else {
      version = health.data.version
    }
  }
  return {
    target: "gauge-profile-api",
    deployment: deps.deployment,
    outcome,
    errorCode,
    version,
    latencyMs: check.latencyMs,
    httpStatus: check.httpStatus,
    ...emptyChainFields,
  }
}

async function probeMatchboxId(
  deps: HealthProbeDeps,
  url: string,
): Promise<HealthProbe> {
  const check = await checkHttp(deps, url)
  let { outcome, errorCode } = check
  if (
    outcome !== "down" &&
    !discoveryDocumentSchema.safeParse(check.body).success
  ) {
    outcome = "down"
    errorCode = "invalid-body"
  }
  return {
    target: "matchbox-id",
    deployment: deps.deployment,
    outcome,
    errorCode,
    version: null,
    latencyMs: check.latencyMs,
    httpStatus: check.httpStatus,
    ...emptyChainFields,
  }
}

async function probeChainSync(
  deps: HealthProbeDeps,
  network: NetworkSlug,
): Promise<HealthProbe | null> {
  let snapshot: ChainSyncSnapshot
  try {
    snapshot = await deps.latestChainSync(network)
  } catch (error) {
    // The API probe already reflects a store outage; no data point.
    deps.logger.warn({ message: "Chain sync unreadable", network, error })
    return null
  }
  let head: bigint | null = null
  let headFailed = false
  try {
    head = await deps.headBlock(network)
  } catch (error) {
    headFailed = true
    deps.logger.warn({ message: "RPC head unavailable", network, error })
  }
  const nowMs = deps.now().getTime()
  const checkedAtMs =
    snapshot.checkedAt === null ? Number.NaN : Date.parse(snapshot.checkedAt)
  const lagSeconds = Number.isNaN(checkedAtMs)
    ? null
    : Math.max(Math.floor((nowMs - checkedAtMs) / 1000), 0)
  const graded = chainSyncOutcome(lagSeconds)
  const block = decimalStringSchema.safeParse(snapshot.blockNumber).success
    ? BigInt(snapshot.blockNumber ?? "0")
    : null
  const behind =
    head === null || block === null ? null : head > block ? head - block : 0n
  return {
    target: chainSyncTarget(network),
    deployment: deps.deployment,
    outcome: graded.outcome,
    errorCode: graded.errorCode ?? (headFailed ? "rpc-unavailable" : null),
    network,
    version: null,
    blockNumber: snapshot.blockNumber,
    chainCheckedAt: Number.isNaN(checkedAtMs)
      ? null
      : new Date(checkedAtMs).toISOString(),
    headBlock: head === null ? null : head.toString(),
    latencyMs: 0,
    httpStatus: 0,
    lagSeconds: lagSeconds ?? -1,
    blocksBehind:
      behind === null || behind > BigInt(Number.MAX_SAFE_INTEGER)
        ? -1
        : Number(behind),
  }
}

/** Runs every probe concurrently and records the results. */
export default async function runHealthProbes(
  deps: HealthProbeDeps,
): Promise<HealthProbe[]> {
  const pending: Promise<HealthProbe | null>[] = []
  if (deps.apiHealthUrl !== null) {
    pending.push(probeApi(deps, deps.apiHealthUrl))
  }
  if (deps.idDiscoveryUrl !== null) {
    pending.push(probeMatchboxId(deps, deps.idDiscoveryUrl))
  }
  for (const network of networkSlugSchema.options) {
    pending.push(probeChainSync(deps, network))
  }
  const probes: HealthProbe[] = []
  for (const probe of await Promise.all(pending)) {
    if (probe === null) continue
    probes.push(probe)
    if (deps.sink === null) continue
    try {
      deps.sink.writeDataPoint(healthProbeDataPoint(probe))
    } catch (error) {
      deps.logger.warn({ message: "Health probe write failed", error })
    }
  }
  const failing = probes.filter((probe) => probe.outcome !== "up")
  if (failing.length > 0) {
    deps.logger.warn({
      message: "Health probes not up",
      probes: failing.map((probe) => ({
        target: probe.target,
        outcome: probe.outcome,
        errorCode: probe.errorCode,
        httpStatus: probe.httpStatus,
      })),
    })
  }
  return probes
}
