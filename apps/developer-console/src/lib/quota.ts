import type { App } from "@repo/platform-contracts/console"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import type {
  EnvironmentQuotaStatus,
  QuotaWindow,
} from "@repo/platform-contracts/rate-limits"

/** used / limit in [0, 1]. */
export function quotaFraction(window: QuotaWindow): number {
  if (window.limit <= 0) return 0
  return Math.min(1, Math.max(0, window.used / window.limit))
}

/** Whole percent for display ("61%"); never rounds a non-zero use to 0. */
export function quotaPercent(window: QuotaWindow): string {
  const percent = quotaFraction(window) * 100
  if (percent > 0 && percent < 1) return "<1%"
  return `${Math.round(percent)}%`
}

/** Seconds until the next 00:00 UTC. */
export function secondsToUtcMidnight(now: number): number {
  const date = new Date(now)
  const midnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  )
  return Math.max(0, Math.round((midnight - now) / 1000))
}

export type QuotaRow = {
  environmentId: string
  appId: string
  appName: string
  kind: EnvironmentKind
  status: EnvironmentQuotaStatus
}

/**
 * Joins quota statuses to their apps in app order, live before test.
 * Statuses for environments outside `apps` (other orgs) are dropped.
 */
export function quotaRows(
  apps: readonly App[],
  quotas: readonly EnvironmentQuotaStatus[],
): QuotaRow[] {
  const byEnvironment = new Map(
    quotas.map((status) => [status.environmentId, status]),
  )
  const rows: QuotaRow[] = []
  for (const app of apps) {
    const environments = [...app.environments].sort((left, right) =>
      left.kind === right.kind ? 0 : left.kind === "live" ? -1 : 1,
    )
    for (const environment of environments) {
      const status = byEnvironment.get(environment.id)
      if (status === undefined) continue
      rows.push({
        environmentId: environment.id,
        appId: app.id,
        appName: app.name,
        kind: environment.kind,
        status,
      })
    }
  }
  return rows
}
