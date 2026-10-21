import { formatMicroUsd } from "@/lib/money"
import * as Checkbox from "@repo/ui/checkbox"
import { cn } from "@repo/ui/cn"
import * as Skeleton from "@repo/ui/skeleton"
import type { ReactElement, ReactNode } from "react"
import {
  type ClaimSource,
  formatTokenList,
  sourceLabel,
  sourceMeta,
  sourceShortLabel,
} from "./claimSources"

type ClaimPanelProps = {
  status: "loading" | "ready" | "error"
  sources: ClaimSource[]
  selected: ReadonlySet<string>
  onToggle: (key: string, checked: boolean) => void
  /** Claimable total for the selected sources. */
  totalMicro: bigint
  /** Some sources or tokens are unpriced or reads failed: show a lower bound. */
  lowerBound: boolean
  natives: string
  /** Signature note, or the reason claiming is unavailable. */
  note: ReactNode
  noteTone: "accent" | "muted" | "warn"
  failedSimulation: ReadonlySet<string>
  action: ReactNode
}

/** Claimable now: hero amount, Claim all, and one row per signature. */
export default function ClaimPanel({
  status,
  sources,
  selected,
  onToggle,
  totalMicro,
  lowerBound,
  natives,
  note,
  noteTone,
  failedSimulation,
  action,
}: ClaimPanelProps): ReactElement {
  const order = sources
    .filter((source) => selected.has(source.key))
    .map((source) => source.key)

  return (
    <section
      aria-labelledby="claimable-heading"
      aria-busy={status === "loading" || undefined}
      className="flex min-w-0 flex-col gap-3 md:max-w-[680px] xl:max-w-[635px] xl:gap-2.5"
    >
      <h2
        id="claimable-heading"
        className="sr-only text-body-sm text-muted xl:not-sr-only"
      >
        Claimable now
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3 xl:justify-start">
        {status === "loading" ? (
          <Skeleton.Root className="h-10 w-48 rounded-md" />
        ) : (
          <p className="text-[32px] font-600 leading-[40px] tracking-[-0.01em] text-ink tabular-nums md:text-[36px] md:leading-[44px] xl:text-hero">
            {status === "error"
              ? "—"
              : `${lowerBound ? "≥ " : ""}${formatMicroUsd(totalMicro)}`}
          </p>
        )}
        {action}
      </div>
      {natives ? (
        <p className="hidden text-body-sm text-secondary tabular-nums xl:block">
          {natives}
        </p>
      ) : null}
      {note ? (
        <p
          aria-live="polite"
          className={cn(
            "text-label tabular-nums",
            noteTone === "accent" && "text-accent-ink",
            noteTone === "muted" && "text-secondary",
            noteTone === "warn" && "text-warn",
          )}
        >
          {note}
          {natives && noteTone === "accent" ? (
            <span className="hidden md:inline xl:hidden"> · {natives}</span>
          ) : null}
        </p>
      ) : null}

      {status === "loading" ? (
        <div className="flex flex-col gap-3 pt-1">
          <Skeleton.Root className="h-4 w-full" />
          <Skeleton.Root className="h-4 w-full" />
        </div>
      ) : sources.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0 xl:-mt-0.5">
          {sources.map((source) => (
            <SourceRow
              key={source.key}
              source={source}
              checked={selected.has(source.key)}
              signature={order.indexOf(source.key) + 1}
              simulationFailed={failedSimulation.has(source.key)}
              onToggle={(checked) => onToggle(source.key, checked)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function SourceRow({
  source,
  checked,
  signature,
  simulationFailed,
  onToggle,
}: {
  source: ClaimSource
  checked: boolean
  signature: number
  simulationFailed: boolean
  onToggle: (checked: boolean) => void
}): ReactElement {
  const id = `claim-source-${source.key.replace(/[^a-z0-9-]/gi, "-")}`
  const priced = source.unpriced < source.tokens.length
  return (
    <li className="flex min-h-[44px] items-center gap-2.5 border-b border-line py-2 xl:min-h-[46px]">
      <Checkbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(value) => onToggle(value === true)}
      />
      <label
        htmlFor={id}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-label text-ink md:text-body-sm xl:font-500">
            <span className="xl:hidden">{sourceShortLabel(source)}</span>
            <span className="hidden xl:inline">{sourceLabel(source)}</span>
          </span>
          <span className="hidden truncate text-caption text-muted xl:block">
            {sourceMeta(source)}
          </span>
          {simulationFailed ? (
            <span className="text-caption text-warn">Simulation failed</span>
          ) : null}
        </span>
        <span
          title={formatTokenList(source.tokens)}
          className="hidden w-[120px] shrink-0 truncate text-right text-label text-secondary tabular-nums min-[1400px]:block"
        >
          {formatTokenList(source.tokens.slice(0, 1))}
          {source.tokens.length > 1 ? ` +${source.tokens.length - 1}` : ""}
        </span>
        <span
          className={cn(
            "shrink-0 text-right text-body-sm font-600 tabular-nums xl:w-[72px]",
            checked ? "text-ink" : "text-muted",
          )}
        >
          {priced
            ? `${source.unpriced > 0 ? "≥ " : ""}${formatMicroUsd(source.usdMicro)}`
            : "Unpriced"}
        </span>
      </label>
      <span
        className={cn(
          "shrink-0 text-right tabular-nums",
          "w-9 text-caption text-muted md:text-label",
          "xl:inline-flex xl:h-[22px] xl:w-[76px] xl:items-center xl:justify-center xl:rounded xl:bg-inset xl:text-micro xl:text-secondary",
          !checked && "xl:bg-transparent",
        )}
      >
        {checked ? (
          <>
            <span className="xl:hidden">Sig {signature}</span>
            <span className="hidden xl:inline">Signature {signature}</span>
          </>
        ) : (
          <span className="sr-only">Not selected</span>
        )}
      </span>
    </li>
  )
}
