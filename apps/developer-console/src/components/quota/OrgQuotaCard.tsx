import type { App } from "@repo/platform-contracts/console"
import { cn } from "@repo/ui/cn"
import * as Skeleton from "@repo/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import { RotateCcw } from "lucide-react"
import type { ReactElement } from "react"
import { dash, formatInteger, formatSpan } from "../../lib/format"
import { orgQuotasQuery } from "../../lib/queries"
import {
  type QuotaRow,
  quotaFraction,
  quotaPercent,
  quotaRows,
  secondsToUtcMidnight,
} from "../../lib/quota"
import { EnvPill } from "../ui/Pill"
import QuotaBar, { quotaWarnAt } from "../ui/QuotaBar"

/** "Quota · today" (C02): daily Gauge Profile API use per environment. */
export default function OrgQuotaCard({
  orgId,
  apps,
  limit = 4,
  className,
}: {
  orgId: string
  apps: App[] | undefined
  limit?: number
  className?: string | undefined
}): ReactElement {
  const quotas = useQuery(orgQuotasQuery(orgId, "both"))
  const rows =
    quotas.data === undefined || apps === undefined
      ? []
      : quotaRows(apps, quotas.data.data).slice(0, limit)
  const pending = quotas.isPending || apps === undefined

  return (
    <section
      aria-labelledby="quota-today"
      aria-busy={pending || undefined}
      className={cn(
        "flex min-w-0 flex-col rounded-lg border border-line bg-surface px-5 pb-2.5 pt-[18px]",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 pb-0.5">
        <h2 id="quota-today" className="text-body font-600 text-ink">
          Quota · today
        </h2>
        <span className="flex-1" />
        <span className="text-caption text-muted">UTC day</span>
      </div>
      {pending ? (
        <div className="flex flex-col gap-3 py-3">
          {["a", "b", "c"].map((key) => (
            <Skeleton.Root key={key} shape="block" className="h-12" />
          ))}
        </div>
      ) : quotas.isError ? (
        <p className="border-b border-line py-4 text-body-sm text-secondary">
          Unavailable
        </p>
      ) : rows.length === 0 ? (
        <p className="border-b border-line py-4 text-body-sm text-secondary">
          No environments
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-x-8 p-0 md:grid-cols-2 min-[1360px]:grid-cols-1">
          {rows.map((row) => (
            <QuotaItem key={row.environmentId} row={row} />
          ))}
        </ul>
      )}
      <p className="flex items-center gap-2 pb-1.5 pt-3 text-label text-secondary">
        <RotateCcw
          aria-hidden="true"
          size={13}
          strokeWidth={1.75}
          className="text-muted"
        />
        Resets 00:00 UTC
        <span className="flex-1" />
        <span className="font-mono text-label text-ink-2">
          {`in ${formatSpan(secondsToUtcMidnight(Date.now()))}`}
        </span>
      </p>
    </section>
  )
}

function QuotaItem({ row }: { row: QuotaRow }): ReactElement {
  const daily = row.status.secret?.daily ?? null
  const burst = row.status.secret?.burst ?? null
  const fraction = daily === null ? 0 : quotaFraction(daily)
  const warn = daily !== null && fraction >= quotaWarnAt
  return (
    <li className="flex flex-col gap-[7px] border-b border-line py-3">
      <p className="flex min-w-0 items-center gap-2">
        <span className="truncate text-body-sm font-600 text-ink">
          {row.appName}
        </span>
        <EnvPill kind={row.kind} />
        <span className="flex-1" />
        <span
          className={cn(
            "font-mono text-label",
            warn ? "text-accent-ink" : "text-ink-2",
          )}
        >
          {daily === null ? dash : quotaPercent(daily)}
        </span>
      </p>
      {daily === null ? (
        <span className="h-1.5 rounded-[3px] bg-inset" />
      ) : (
        <QuotaBar
          fraction={fraction}
          label={`${row.appName} ${row.kind} daily quota used`}
        />
      )}
      <p className="flex items-center font-mono text-caption text-secondary">
        {daily === null
          ? dash
          : `${formatInteger(daily.used)} / ${formatInteger(daily.limit)}`}
        <span className="flex-1" />
        {burst === null ? dash : `${formatInteger(burst.limit)} / min`}
      </p>
    </li>
  )
}
