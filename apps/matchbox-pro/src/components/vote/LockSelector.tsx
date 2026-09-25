import Button from "@/components/ui/Button"
import TokenMark from "@/components/ui/TokenMark"
import type { VeMEZOLock } from "@/hooks/useLocks"
import { cn } from "@/lib/cn"
import { formatVeAmount } from "@/lib/money"
import { Link } from "@tanstack/react-router"
import { Check } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import { isLockExpired, lockStatusLabel } from "./model"

type LockSelectorProps = {
  isConnected: boolean
  isLoading: boolean
  locks: VeMEZOLock[]
  selectedIds: ReadonlySet<string>
  selectedPower: bigint
  allSelected: boolean
  onToggle: (id: string) => void
  onSelectAll: () => void
  onConnect: () => void
}

export default function LockSelector(props: LockSelectorProps): ReactElement {
  const votableCount = props.locks.filter((lock) => !isLockExpired(lock)).length
  const canSelect = props.isConnected && votableCount > 0

  let summary = "Not connected"
  if (props.isConnected)
    summary = `${props.selectedIds.size} selected  ·  ${formatVeAmount(props.selectedPower)} veMEZO`

  return (
    <section
      aria-labelledby="vote-locks-title"
      className="flex flex-col gap-2 md:gap-3.5"
    >
      <header className="flex items-center justify-between md:hidden">
        <h2 className="text-[12px] font-600 text-secondary tabular-nums">
          Locks
          {props.isConnected && votableCount > 0
            ? ` ${props.selectedIds.size}/${votableCount}`
            : null}
        </h2>
        {props.isConnected ? (
          <p className="font-mono text-[11px] font-500 text-secondary">
            {formatVeAmount(props.selectedPower)} veMEZO
          </p>
        ) : null}
      </header>
      <header className="hidden flex-wrap items-center gap-3 md:flex">
        <h2 id="vote-locks-title" className="text-[16px] font-650 text-ink">
          veMEZO
        </h2>
        <button
          type="button"
          disabled={!canSelect}
          onClick={props.onSelectAll}
          aria-pressed={props.allSelected}
          className="flex items-center gap-2 text-[13px] font-500 text-secondary enabled:hover:text-ink"
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-[22px] items-center justify-center rounded-full border-2",
              props.allSelected || !props.isConnected
                ? "border-accent bg-accent text-on-accent"
                : "border-line-2 bg-surface",
            )}
          >
            {props.allSelected ? <Check size={12} strokeWidth={3} /> : null}
          </span>
          Select all
        </button>
        <p className="whitespace-pre text-[13px] font-500 text-secondary tabular-nums">
          {summary}
        </p>
      </header>
      <LockSelectorBody {...props} />
    </section>
  )
}

function LockSelectorBody(props: LockSelectorProps): ReactElement {
  if (!props.isConnected)
    return (
      <Notice
        title="Wallet not connected"
        action={
          <Button onClick={props.onConnect} className="h-8 rounded-[7px] px-3">
            Connect wallet
          </Button>
        }
      />
    )

  if (props.isLoading)
    return (
      <ul aria-hidden="true" className="flex gap-4">
        {["a", "b", "c", "d"].map((key) => (
          <li
            key={key}
            className="h-11 min-w-[104px] rounded-[10px] bg-inset md:h-[148px] md:min-w-[150px] md:flex-1 md:rounded-[13px]"
          />
        ))}
      </ul>
    )

  if (props.locks.every(isLockExpired))
    return (
      <Notice
        title="No votable locks"
        action={
          <Link
            to="/"
            className="inline-flex h-8 items-center rounded-[7px] bg-accent px-3 text-[12px] font-700 text-on-accent hover:brightness-95"
          >
            Manage locks
          </Link>
        }
      />
    )

  return (
    <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 md:-mx-1 md:gap-4 md:px-1 md:pb-1">
      {props.locks.map((lock) => {
        const id = lock.tokenId.toString()
        const selected = props.selectedIds.has(id)
        return (
          <li key={id} className="shrink-0 md:min-w-[150px] md:flex-1">
            <LockChip
              lock={lock}
              selected={selected}
              onToggle={() => props.onToggle(id)}
            />
            <LockTile
              lock={lock}
              selected={selected}
              onToggle={() => props.onToggle(id)}
            />
          </li>
        )
      })}
    </ul>
  )
}

function LockTile({
  lock,
  selected,
  onToggle,
}: {
  lock: VeMEZOLock
  selected: boolean
  onToggle: () => void
}): ReactElement {
  const expired = isLockExpired(lock)
  return (
    <button
      type="button"
      disabled={expired}
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "hidden h-[148px] w-full flex-col rounded-[13px] md:flex px-3.5 pb-3 pt-3.5 text-left transition-[filter]",
        expired ? "bg-expired" : "bg-mezo text-white hover:brightness-105",
      )}
    >
      <span className="flex w-full items-start justify-between">
        <TokenMark
          kind="mezo"
          tone="inverse"
          size={22}
          className={expired ? "bg-white/60 opacity-60 grayscale" : ""}
        />
        <span
          aria-hidden="true"
          className={cn(
            "flex size-7 items-center justify-center rounded-full",
            selected
              ? "bg-white text-mezo"
              : "border-2 border-white bg-white/20",
          )}
        >
          {selected ? <Check size={15} strokeWidth={2.5} /> : null}
        </span>
      </span>
      <span
        className={cn(
          "mt-0.5 text-[15px] font-650 tabular-nums",
          expired && "text-ink-2",
        )}
      >
        {formatVeAmount(lock.votingPower)} veMEZO
      </span>
      <span
        className={cn("mt-auto text-[13px] font-700", expired && "text-ink")}
      >
        #{lock.tokenId.toString()}
      </span>
      <span
        className={cn(
          "text-[11px] font-500",
          expired ? "text-secondary" : "text-white/90",
        )}
      >
        {lockStatusLabel(lock)}
      </span>
    </button>
  )
}

function LockChip({
  lock,
  selected,
  onToggle,
}: {
  lock: VeMEZOLock
  selected: boolean
  onToggle: () => void
}): ReactElement {
  const expired = isLockExpired(lock)
  return (
    <button
      type="button"
      disabled={expired}
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "flex h-11 items-center gap-2 rounded-[10px] px-3 text-left md:hidden",
        selected ? "bg-mezo text-white" : "bg-inset text-ink-2",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
          selected ? "border-white bg-white text-mezo" : "border-line-2",
        )}
      >
        {selected ? <Check size={11} strokeWidth={2.5} /> : null}
      </span>
      <span className="flex flex-col gap-px">
        <span className="text-[12px] font-650 tabular-nums">
          {formatVeAmount(lock.votingPower)}
        </span>
        <span
          className={cn(
            "text-[10px] font-550",
            selected ? "text-white/80" : "text-muted",
          )}
        >
          #{lock.tokenId.toString()}
          {expired ? " · Expired" : null}
        </span>
      </span>
    </button>
  )
}

function Notice({
  title,
  action,
}: {
  title: string
  action: ReactNode
}): ReactElement {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[10px] bg-inset px-3.5 py-4">
      <p className="text-[14px] font-650 text-ink">{title}</p>
      {action}
    </div>
  )
}
