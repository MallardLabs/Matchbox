import { useLockFlows } from "@/features/locks/LockFlows"
import type { ClaimGroup } from "@/features/locks/claims"
import { epochLabel } from "@/lib/epoch"
import { formatApyBasisPoints, formatMicroUsd } from "@/lib/money"
import { formatCompactNumber, formatWholeUsd } from "@/lib/overview"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Skeleton from "@repo/ui/skeleton"
import { Link } from "@tanstack/react-router"
import { ChevronRight, Gift, LoaderCircle, Vote } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import EarningsChart from "./EarningsChart"
import TokenChips from "./TokenChips"
import { earningsBars } from "./earnings"
import type { Overview } from "./useOverview"

/** J01 hero (T01 on tablets, M01 on phones): claim cluster + earnings. */
export default function OverviewHero({
  overview,
}: {
  overview: Overview
}): ReactElement {
  const { claims, claimable, projected, epoch, locksState } = overview
  const hasLocks = locksState === "ready"
  const bars = earningsBars({
    history: overview.history,
    epochStart: epoch.epochStart,
    current: claimable,
    next: projected,
  })
  const historyNote =
    overview.history.status === "ready"
      ? overview.history.freshness?.state === "stale"
        ? "Stale"
        : null
      : overview.history.status === "loading"
        ? null
        : "History unavailable"

  return (
    <section
      aria-labelledby="overview-title"
      className={cn(
        "grid gap-x-14 gap-y-10 lg:grid-cols-[440px_minmax(0,1fr)]",
        hasLocks ? "lg:min-h-[400px]" : "lg:min-h-[280px]",
      )}
    >
      <div className="flex min-w-0 flex-col">
        <h1
          id="overview-title"
          className="m-0 text-title font-600 text-ink max-md:sr-only"
        >
          Overview
        </h1>
        <p className="m-0 flex items-center gap-1.5 text-label text-accent-ink md:mt-3.5 md:text-body-sm md:font-600">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-pos md:hidden"
          />
          {epochLabel(epoch.epochStart)}
          <span className="md:hidden">· {epoch.label}</span>
        </p>

        <ClaimBlock overview={overview} />

        <dl className="m-0 mt-[18px] grid grid-cols-3 border-y border-line py-3 md:mt-3.5 md:flex md:gap-10 md:border-0 md:py-0">
          <Metric label="APY" accent>
            {projected.status === "loading" ? (
              <Skeleton.Root className="h-6 w-16" />
            ) : (
              formatApyBasisPoints(overview.apyBasisPoints)
            )}
          </Metric>
          <Metric label="Projected">
            {projected.status === "loading" ? (
              <Skeleton.Root className="h-6 w-16" />
            ) : projected.status === "ready" ? (
              formatMicroUsd(projected.usdMicro)
            ) : (
              "—"
            )}
          </Metric>
          <Metric label="Voting power" className="md:hidden">
            {overview.votingPower
              ? formatCompactNumber(overview.votingPower.amount / 10n ** 18n)
              : "—"}
          </Metric>
        </dl>

        {overview.unvoted.length > 0 ? (
          <UnvotedCallout count={overview.unvoted.length} />
        ) : null}

        {claims.groups.length > 0 ? (
          <ClaimSources groups={claims.groups} />
        ) : null}
      </div>

      <EarningsChart
        title="Earnings by epoch"
        bars={bars}
        legend={["realized", "claimable", "projected"]}
        note={historyNote}
        busy={claimable.status === "loading"}
        detail={(bar) => {
          if (bar.value === null) return null
          if (bar.key === "current") {
            return {
              heading: `${epochLabel(epoch.epochStart)} · claimable`,
              value: formatMicroUsd(claims.usdMicro),
              note: null,
              rows: claims.groups.map((group) => ({
                key: group.id,
                label: group.label,
                value: formatMicroUsd(group.usdMicro),
              })),
            }
          }
          if (bar.key === "next") {
            return {
              heading: "Next epoch · projected",
              value: bar.display,
              note:
                overview.apyBasisPoints === null
                  ? null
                  : `${formatApyBasisPoints(overview.apyBasisPoints)} APY`,
              rows: [],
            }
          }
          return {
            heading: `Epoch ${bar.label} · realized`,
            value: bar.display,
            note: null,
            rows: [],
          }
        }}
        className="max-md:hidden"
      />
    </section>
  )
}

function ClaimBlock({ overview }: { overview: Overview }): ReactElement {
  const { claims, claimable } = overview
  const { gate, open, claim } = useLockFlows()
  const canClaim = claims.sources.length > 0 || claim.running
  // Some claim reads failed: the total is a lower bound.
  const value =
    claimable.status === "ready"
      ? claims.usdMicro === 0n && claims.unpriced
        ? "Unpriced"
        : `${claims.incomplete ? "≥ " : ""}${formatMicroUsd(claimable.usdMicro)}`
      : claimable.status === "unavailable"
        ? "Unavailable"
        : claimable.status === "none"
          ? "—"
          : null

  const claimLabel = claim.running
    ? "Claiming"
    : claim.confirming
      ? "Confirming"
      : "Claim all"
  // While signing, the busy button stays clickable and brings the sheet back.
  const claimProps = {
    loading: claim.confirming && !claim.running,
    "aria-busy": claim.running || undefined,
    onClick: () =>
      claim.running ? claim.reopen() : open({ type: "claim", lock: null }),
  }
  const busyMark = claim.running ? (
    <LoaderCircle
      aria-hidden="true"
      size={14}
      strokeWidth={2}
      className="animate-spin motion-reduce:animate-none"
    />
  ) : null

  const action = !canClaim ? null : gate.canSign ? (
    <Button.Root {...claimProps} className="min-w-24">
      {busyMark}
      {claimLabel}
    </Button.Root>
  ) : (
    <Button.Root variant="secondary" onClick={gate.resolve}>
      {gate.label}
    </Button.Root>
  )

  return (
    <>
      <dl className="m-0 mt-1.5 flex flex-col md:mt-8">
        <dt className="text-body-sm font-500 text-muted md:text-label md:text-secondary">
          Claimable
        </dt>
        <dd className="m-0 mt-1.5 flex items-center gap-7 md:mt-3.5 md:h-12">
          {value === null ? (
            <Skeleton.Root className="h-11 w-48 rounded-md" />
          ) : (
            <span
              className={cn(
                "text-[44px] font-500 leading-[52px] tracking-[-1px] tabular-nums text-ink md:text-hero md:font-600 md:tracking-normal",
                (value === "Unavailable" || value === "Unpriced") &&
                  "text-secondary md:text-title",
              )}
            >
              {value}
            </span>
          )}
          {action ? <span className="max-md:hidden">{action}</span> : null}
        </dd>
        {claims.tokens.length > 0 || claims.incomplete ? (
          <dd className="m-0 mt-1.5 flex flex-wrap items-center gap-2.5 md:mt-3.5">
            <TokenChips
              tokens={claims.tokens}
              size="md"
              className="md:hidden"
            />
            <TokenChips
              tokens={claims.tokens}
              size="sm"
              className="max-md:hidden"
            />
            {claims.unpriced && claims.usdMicro > 0n ? (
              <Badge.Root tone="warn">+ unpriced</Badge.Root>
            ) : null}
            {claims.incomplete ? (
              <Badge.Root tone="warn">Partial</Badge.Root>
            ) : null}
          </dd>
        ) : null}
      </dl>
      {canClaim ? (
        gate.canSign ? (
          <Button.Root
            {...claimProps}
            size="lg"
            className="mt-[18px] h-12 w-full gap-2 rounded-[10px] text-body md:hidden"
          >
            {claimProps.loading
              ? null
              : (busyMark ?? (
                  <Gift aria-hidden="true" size={16} strokeWidth={1.75} />
                ))}
            {claimLabel}
          </Button.Root>
        ) : (
          <Button.Root
            variant="secondary"
            size="lg"
            className="mt-[18px] h-12 w-full rounded-[10px] text-body md:hidden"
            onClick={gate.resolve}
          >
            {gate.label}
          </Button.Root>
        )
      ) : null}
    </>
  )
}

function Metric({
  label,
  accent = false,
  className,
  children,
}: {
  label: string
  accent?: boolean
  className?: string
  children: ReactNode
}): ReactElement {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <dt className="text-caption font-500 text-muted md:text-label md:text-secondary">
        {label}
      </dt>
      <dd
        className={cn(
          "m-0 text-title-sm font-500 tabular-nums md:text-metric md:font-600",
          accent ? "text-accent-ink" : "text-ink",
        )}
      >
        {children}
      </dd>
    </div>
  )
}

function UnvotedCallout({ count }: { count: number }): ReactElement {
  return (
    <aside
      aria-label="Unvoted locks"
      className="mt-[18px] flex items-center gap-3 rounded-xl bg-accent-soft p-3.5 md:hidden"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft-2 text-accent-ink">
        <Vote aria-hidden="true" size={16} strokeWidth={1.75} />
      </span>
      <p className="m-0 flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-sm font-600 text-ink">Unvoted</span>
        <span className="text-caption font-500 text-accent-ink">
          {count === 1 ? "1 lock" : `${count} locks`}
        </span>
      </p>
      <Link
        to="/vote"
        className="flex h-8 items-center rounded-[7px] bg-accent px-3 text-label font-700 text-on-accent"
      >
        Vote
      </Link>
    </aside>
  )
}

function ClaimSources({ groups }: { groups: ClaimGroup[] }): ReactElement {
  return (
    <ul
      aria-label="Claimable by source"
      className="m-0 mt-[30px] flex list-none flex-col gap-0.5 p-0 max-md:hidden"
    >
      {groups.map((group, index) => (
        <li key={group.id}>
          <details open={index === 0} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded text-body-sm [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 text-ink-2">
                <ChevronRight
                  aria-hidden="true"
                  size={14}
                  strokeWidth={1.75}
                  className="text-muted transition-transform group-open:rotate-90"
                />
                {group.label}
              </span>
              <span className="font-500 tabular-nums text-muted">
                {group.usdMicro === 0n && group.unpriced
                  ? "Unpriced"
                  : group.usdMicro < 500_000n
                    ? "<$1"
                    : formatWholeUsd(group.usdMicro)}
              </span>
            </summary>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {group.rows.map((source) => (
                <li
                  key={source.key}
                  className="flex items-center justify-between gap-4 py-px pl-[22px]"
                >
                  <span className="truncate text-label font-500 text-secondary">
                    {source.label}
                  </span>
                  <TokenChips tokens={source.tokens} className="justify-end" />
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  )
}
