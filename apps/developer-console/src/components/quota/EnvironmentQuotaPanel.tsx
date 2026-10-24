import type { EnvironmentKind } from "@repo/platform-contracts/network"
import type { QuotaWindow } from "@repo/platform-contracts/rate-limits"
import { cn } from "@repo/ui/cn"
import * as Skeleton from "@repo/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import type { ReactElement } from "react"
import {
  dash,
  formatAgo,
  formatInteger,
  formatMonthDay,
  formatSpan,
} from "../../lib/format"
import { quotaQuery } from "../../lib/queries"
import {
  quotaFraction,
  quotaPercent,
  secondsToUtcMidnight,
} from "../../lib/quota"
import QuotaBar, { quotaWarnAt } from "../ui/QuotaBar"

function QuotaLine({
  title,
  window,
  sub,
}: {
  title: string
  window: QuotaWindow | null
  sub: string
}): ReactElement {
  const fraction = window === null ? 0 : quotaFraction(window)
  return (
    <div className="flex flex-col gap-1.5 border-b border-line py-2.5">
      <p className="flex items-center gap-2">
        <span className="text-body-sm font-600 text-ink">{title}</span>
        <span className="flex-1" />
        <span className="font-mono text-label text-ink-2">
          {window === null
            ? dash
            : `${formatInteger(window.used)} / ${formatInteger(window.limit)}`}
        </span>
      </p>
      {window === null ? (
        <span className="h-1.5 rounded-[3px] bg-inset" />
      ) : (
        <QuotaBar fraction={fraction} label={`${title} quota used`} />
      )}
      <p className="flex items-center gap-2 text-caption text-muted">
        {sub}
        <span className="flex-1" />
        <span
          className={cn(
            "font-mono",
            window !== null && fraction >= quotaWarnAt
              ? "text-accent-ink"
              : "text-muted",
          )}
        >
          {window === null ? dash : quotaPercent(window)}
        </span>
      </p>
    </div>
  )
}

/** "Quota · Live" (C04e): daily, burst and publishable share right now. */
export default function EnvironmentQuotaPanel({
  environmentId,
  kind,
}: {
  environmentId: string
  kind: EnvironmentKind
}): ReactElement {
  const quota = useQuery(quotaQuery(environmentId))
  const data = quota.data
  const override = data?.override ?? null
  return (
    <section
      aria-labelledby="environment-quota"
      aria-busy={quota.isPending || undefined}
      className="flex min-w-0 flex-col self-start rounded-lg border border-line bg-surface px-5 pb-2 pt-4"
    >
      <div className="flex items-center gap-2.5 pb-1">
        <h2 id="environment-quota" className="text-body font-600 text-ink">
          {`Quota · ${kind === "live" ? "Live" : "Test"}`}
        </h2>
        <span className="flex-1" />
        <span className="text-caption text-muted">
          {data === undefined
            ? ""
            : formatAgo(
                Math.max(0, (Date.now() - Date.parse(data.observedAt)) / 1000),
              )}
        </span>
      </div>
      {quota.isPending ? (
        <div className="flex flex-col gap-3 py-2">
          <Skeleton.Root shape="block" className="h-12" />
          <Skeleton.Root shape="block" className="h-12" />
          <Skeleton.Root shape="block" className="h-12" />
        </div>
      ) : quota.isError ? (
        <p className="py-3 text-body-sm text-secondary">Unavailable</p>
      ) : (
        <>
          <QuotaLine
            title="Daily"
            window={data?.secret?.daily ?? null}
            sub={`resets 00:00 UTC · ${formatSpan(secondsToUtcMidnight(Date.now()))}`}
          />
          <QuotaLine
            title="Burst"
            window={data?.secret?.burst ?? null}
            sub="per minute"
          />
          <QuotaLine
            title="Publishable"
            window={data?.publishable?.daily ?? null}
            sub="browser share · per day"
          />
          <p className="flex items-center gap-1.5 py-2.5 text-label text-secondary">
            Override
            <span className="flex-1" />
            {override === null ? (
              <span className="text-muted">{dash}</span>
            ) : (
              <span className="font-mono text-ink-2">
                {`${formatInteger(override.perDay)}/d · ${formatInteger(override.perMinute)}/min${override.expiresAt === null ? "" : ` · ${formatMonthDay(override.expiresAt)}`}`}
              </span>
            )}
          </p>
        </>
      )}
    </section>
  )
}
