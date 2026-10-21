import { cn } from "@repo/ui/cn"
import { ArrowUp, Search } from "lucide-react"
import {
  type FormEvent,
  type ReactElement,
  type ReactNode,
  useId,
  useState,
} from "react"
import type { Evidence } from "./contract"
import { formatBlock } from "./format"

export const primaryAction =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-accent px-3.5 text-body-sm font-600 text-on-accent transition-[filter] hover:brightness-95 active:brightness-90 disabled:pointer-events-none disabled:bg-inset disabled:text-muted"

export const secondaryAction =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-3.5 text-body-sm font-400 text-ink transition-colors hover:border-line-2 hover:bg-raised disabled:pointer-events-none disabled:opacity-40"

export const largePrimary =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-body font-600 text-on-accent transition-[filter] hover:brightness-95 active:brightness-90 disabled:pointer-events-none disabled:bg-inset disabled:text-muted"

export const largeSecondary =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-body font-400 text-ink transition-colors hover:border-line-2 hover:bg-raised disabled:pointer-events-none disabled:opacity-40"

/** "Query · connected 0x3D41…9DC3 · epoch 126" + title + Why? (frame 32 head). */
export function CanvasHeader({
  kicker,
  title,
  titleId,
  aside,
}: {
  kicker: ReactNode
  title: ReactNode
  titleId?: string
  aside?: ReactNode
}): ReactElement {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="m-0 truncate text-label text-muted">{kicker}</p>
        <h1
          id={titleId}
          className="m-0 text-balance text-title-sm font-600 text-ink md:text-[20px] md:leading-[26px] xl:text-metric"
        >
          {title}
        </h1>
      </div>
      {aside ? <div className="flex shrink-0 gap-2 pt-1">{aside}</div> : null}
    </div>
  )
}

export function WhyToggle({
  expanded,
  controls,
  onToggle,
}: {
  expanded: boolean
  controls: string
  onToggle: () => void
}): ReactElement {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
      className={cn(
        "inline-flex h-8 items-center rounded-md border px-3 text-label font-500 text-ink transition-colors hover:border-line-2",
        expanded ? "border-line-2 bg-inset" : "border-line bg-surface",
      )}
    >
      Why?
    </button>
  )
}

export function WhyPanel({
  id,
  items,
}: {
  id: string
  items: readonly { text: string }[]
}): ReactElement {
  return (
    <div
      id={id}
      className="flex flex-col gap-1.5 rounded-lg bg-inset px-4 py-3 text-body-sm text-ink-2"
    >
      {items.length === 0 ? (
        <p className="m-0 text-secondary">No reasoning attached.</p>
      ) : (
        items.map((item) => (
          <p key={item.text} className="m-0">
            {item.text}
          </p>
        ))
      )}
    </div>
  )
}

function evidenceChip(evidence: Evidence): string {
  if (evidence.status === "stale") return `${evidence.label} · stale`
  return evidence.label
}

/** "Sources" chip row; chips name the real source of every number. */
export function SourceChips({
  evidence,
  compact = false,
}: {
  evidence: readonly Evidence[]
  compact?: boolean
}): ReactElement | null {
  if (evidence.length === 0) return null
  const line = (
    <p className={cn("m-0 text-caption text-muted", !compact && "sm:hidden")}>
      Sources · {evidence.map(evidenceChip).join(" · ")}
    </p>
  )
  if (compact) return line
  return (
    <>
      {line}
      <SourceChipRow evidence={evidence} />
    </>
  )
}

function SourceChipRow({
  evidence,
}: {
  evidence: readonly Evidence[]
}): ReactElement {
  return (
    <div className="hidden flex-wrap items-center gap-2 sm:flex">
      <span className="text-caption text-muted">Sources</span>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {evidence.map((item) => (
          <li key={item.id}>
            <SourceChip evidence={item} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function SourceChip({ evidence }: { evidence: Evidence }): ReactElement {
  const title = [
    evidence.source,
    evidence.blockNumber ? `block ${formatBlock(evidence.blockNumber)}` : null,
    evidence.calculationVersion ?? null,
  ]
    .filter(Boolean)
    .join(" · ")
  const className = cn(
    "inline-flex h-6 items-center rounded px-2 text-caption",
    evidence.status === "stale"
      ? "bg-warn-soft text-warn"
      : "bg-inset text-secondary",
  )
  if (evidence.url) {
    return (
      <a
        href={evidence.url}
        target="_blank"
        rel="noreferrer"
        title={title}
        className={cn(className, "hover:text-ink")}
      >
        {evidenceChip(evidence)}
      </a>
    )
  }
  return (
    <span title={title} className={className}>
      {evidenceChip(evidence)}
    </span>
  )
}

/** Follow-up composer (frame 32 bottom, 33 rail, M04). */
export function Composer({
  onSubmit,
  placeholder,
  label,
  disabled = false,
  size = "canvas",
}: {
  onSubmit: (text: string) => void
  placeholder: string
  label: string
  disabled?: boolean
  size?: "canvas" | "rail"
}): ReactElement {
  const [text, setText] = useState("")
  const inputId = useId()
  const canSend = text.trim().length > 0 && !disabled

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!canSend) return
    onSubmit(text.trim())
    setText("")
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        "flex items-center bg-inset focus-within:ring-1 focus-within:ring-line-2",
        size === "canvas"
          ? "h-11 gap-2.5 rounded-lg px-3.5"
          : "h-9 gap-2 rounded-md pl-2.5 pr-1.5",
      )}
    >
      {size === "canvas" ? (
        <Search
          aria-hidden="true"
          size={16}
          strokeWidth={1.75}
          className="shrink-0 text-secondary"
        />
      ) : null}
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        id={inputId}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={2_000}
        disabled={disabled}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed",
          size === "canvas" ? "text-body-sm" : "text-label",
        )}
      />
      <button
        type="submit"
        aria-label={label}
        disabled={!canSend}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md bg-accent text-on-accent transition-[filter,opacity] hover:brightness-95 disabled:cursor-default disabled:opacity-60 disabled:hover:brightness-100",
          size === "canvas" ? "size-7" : "size-6",
        )}
      >
        <ArrowUp aria-hidden="true" size={14} strokeWidth={2} />
      </button>
    </form>
  )
}

/** Label/value row with a hairline below (frames 36, 43). */
export function DetailRow({
  label,
  children,
  tone = "ink",
  className,
}: {
  label: ReactNode
  children: ReactNode
  tone?: "ink" | "neg" | "warn"
  className?: string
}): ReactElement {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-line py-2",
        className,
      )}
    >
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd
        className={cn(
          "m-0 min-w-0 text-right tabular-nums",
          tone === "neg" && "text-neg",
          tone === "warn" && "text-warn",
          tone === "ink" && "text-ink",
        )}
      >
        {children}
      </dd>
    </div>
  )
}

export function Dot(): ReactElement {
  return (
    <span aria-hidden="true" className="px-1.5 text-muted">
      ·
    </span>
  )
}
