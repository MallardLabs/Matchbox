import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as TokenMark from "@repo/ui/token-mark"
import { Link } from "@tanstack/react-router"
import { Check } from "lucide-react"
import type { ReactElement } from "react"
import { formatPower } from "./format"
import type { PowerAsset, VoteLock } from "./model"

type LockSelectorProps = {
  asset: PowerAsset
  mode: "disconnected" | "connected" | "watching"
  isLoading: boolean
  locks: VoteLock[]
  selected: ReadonlySet<string>
  selectedPower: bigint
  onToggle: (tokenId: string) => void
  onSelectAll: () => void
  onConnect: () => void
}

function formatLockPower(asset: PowerAsset, amount: bigint): string {
  return formatPower(amount, asset === "veBTC" ? 4 : 2)
}

/** Lock tiles with circle ticks and Select all (J04); chips on phones (M02). */
export default function LockSelector(props: LockSelectorProps): ReactElement {
  const votable = props.locks.filter((lock) => lock.state === "votable")
  const allSelected =
    votable.length > 0 &&
    votable.every((lock) => props.selected.has(lock.tokenId.toString()))
  const canSelect = props.mode !== "disconnected" && votable.length > 0
  const power = `${formatLockPower(props.asset, props.selectedPower)} ${props.asset}`

  let summary = "Connect to select locks"
  if (props.mode !== "disconnected")
    summary = props.isLoading
      ? "Loading locks"
      : `${props.selected.size} selected · ${power}`

  return (
    <section
      aria-labelledby="vote-locks-title"
      aria-busy={props.isLoading || undefined}
      className="flex flex-col gap-2 md:gap-3.5"
    >
      <header className="flex items-center justify-between gap-3 md:justify-start">
        <h2
          id="vote-locks-title"
          className="text-label font-600 text-secondary md:text-lead md:font-500 md:text-ink"
        >
          <span className="md:hidden">
            Locks
            {props.mode !== "disconnected" && props.locks.length > 0
              ? ` ${props.selected.size}/${props.locks.length}`
              : null}
          </span>
          <span className="hidden md:inline">{props.asset}</span>
        </h2>
        <button
          type="button"
          disabled={!canSelect}
          onClick={props.onSelectAll}
          aria-pressed={allSelected}
          className="hidden items-center gap-2 text-body-sm font-500 text-secondary enabled:hover:text-ink md:flex"
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-[22px] items-center justify-center rounded-full border-2",
              allSelected || props.mode === "disconnected"
                ? "border-accent bg-accent text-on-accent"
                : "border-line-2 bg-surface",
            )}
          >
            {allSelected ? <Check size={12} strokeWidth={3} /> : null}
          </span>
          Select all
        </button>
        <p className="hidden text-body-sm font-500 text-secondary tabular-nums md:block">
          {summary}
        </p>
        {props.mode !== "disconnected" ? (
          <p className="font-mono text-caption font-500 text-secondary md:hidden">
            {power}
          </p>
        ) : null}
      </header>
      <LockBody {...props} />
    </section>
  )
}

function LockBody(props: LockSelectorProps): ReactElement {
  if (props.mode === "disconnected")
    return (
      <div className="flex flex-col items-start gap-3 rounded-[10px] bg-inset px-3.5 py-4">
        <p className="text-body font-500 text-ink">Connect wallet to vote</p>
        <Button.Root size="md" onClick={props.onConnect}>
          Connect wallet
        </Button.Root>
      </div>
    )

  if (props.isLoading)
    return (
      <ul aria-hidden="true" className="m-0 flex list-none gap-2 p-0 md:gap-4">
        {["a", "b", "c", "d"].map((key) => (
          <li
            key={key}
            className="h-11 w-[104px] shrink-0 animate-pulse rounded-[10px] bg-inset motion-reduce:animate-none md:h-[148px] md:w-auto md:min-w-[150px] md:flex-1 md:rounded-[13px]"
          />
        ))}
      </ul>
    )

  if (props.locks.length === 0)
    return (
      <div className="flex flex-col items-start gap-3 rounded-[10px] bg-inset px-3.5 py-4">
        <p className="text-body font-500 text-ink">No {props.asset} locks</p>
        <Button.Root asChild size="md" variant="secondary">
          <Link to="/">Go to Overview</Link>
        </Button.Root>
      </div>
    )

  return (
    <ul className="-mx-4 m-0 flex list-none gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:gap-4 md:px-0">
      {props.locks.map((lock) => {
        const id = lock.tokenId.toString()
        return (
          <li
            key={id}
            className="shrink-0 md:w-[calc((100%-5rem)/6)] md:min-w-[150px]"
          >
            <LockTile
              asset={props.asset}
              lock={lock}
              selected={props.selected.has(id)}
              readOnly={props.mode === "watching"}
              onToggle={() => props.onToggle(id)}
            />
          </li>
        )
      })}
    </ul>
  )
}

function LockTile({
  asset,
  lock,
  selected,
  readOnly,
  onToggle,
}: {
  asset: PowerAsset
  lock: VoteLock
  selected: boolean
  readOnly: boolean
  onToggle: () => void
}): ReactElement {
  const votable = lock.state === "votable"
  const on = votable && selected
  const fill = asset === "veBTC" ? "bg-vebtc" : "bg-vemezo"
  const amount = formatLockPower(asset, lock.votingPower)
  const label = `${asset} #${lock.tokenId}, ${amount} ${asset}, ${lock.detail}`
  return (
    <button
      type="button"
      disabled={!votable}
      onClick={onToggle}
      aria-pressed={votable ? on : undefined}
      aria-label={label}
      title={readOnly && votable ? "Watching · read-only" : undefined}
      className={cn(
        "group flex text-left transition-[filter,background-color] disabled:cursor-not-allowed",
        // Phone chip
        "h-11 items-center gap-2 rounded-[10px] px-3",
        // Tablet and up: tile
        "md:h-[148px] md:w-full md:flex-col md:items-stretch md:gap-0 md:rounded-[13px] md:px-3.5 md:pb-3 md:pt-3.5",
        on
          ? cn(fill, "text-on-card hover:brightness-105")
          : votable
            ? "border border-line bg-inset text-ink hover:border-line-2"
            : "bg-expired text-ink-2",
      )}
    >
      <span className="flex items-center md:w-full md:items-start md:justify-between">
        <TokenMark.Root
          kind={asset === "veBTC" ? "btc" : "mezo"}
          tone="inverse"
          size={22}
          className={cn(
            "hidden md:inline-flex",
            !votable && "opacity-60 grayscale",
          )}
        />
        <Tick on={on} votable={votable} asset={asset} />
      </span>
      <span className="flex flex-col gap-px md:contents">
        <span className="text-label font-600 tabular-nums md:mt-1 md:text-nav md:font-500">
          {amount}
          <span className="hidden md:inline"> {asset}</span>
        </span>
        <span
          className={cn(
            "text-micro font-500 md:mt-auto md:text-body-sm md:font-700",
            on ? "text-on-card/80 md:text-on-card" : "text-muted md:text-ink",
          )}
        >
          #{lock.tokenId.toString()}
          <span className="md:hidden">
            {lock.state === "votable"
              ? null
              : ` · ${lock.state === "voted" ? "Voted" : lock.detail}`}
          </span>
        </span>
        <span
          className={cn(
            "hidden text-caption font-500 md:block",
            on ? "text-on-card/85" : "text-secondary",
          )}
        >
          {lock.detail}
        </span>
      </span>
    </button>
  )
}

function Tick({
  on,
  votable,
  asset,
}: {
  on: boolean
  votable: boolean
  asset: PowerAsset
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        "size-[18px] md:size-7",
        on
          ? cn("bg-surface", asset === "veBTC" ? "text-vebtc" : "text-vemezo")
          : votable
            ? "border-[1.5px] border-line-2 md:border-2"
            : "border-[1.5px] border-surface/70 md:border-2",
      )}
    >
      {on ? (
        <Check className="size-[11px] md:size-[15px]" strokeWidth={3} />
      ) : null}
    </span>
  )
}
