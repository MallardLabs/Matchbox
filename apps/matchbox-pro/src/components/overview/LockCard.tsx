import TokenMark from "@/components/ui/TokenMark"
import { cn } from "@/lib/cn"
import { formatMicroUsd } from "@/lib/money"
import {
  type OverviewLock,
  formatLockAmount,
  formatVotingPower,
  lockStatusLabel,
} from "@/lib/overview"
import { Link } from "@tanstack/react-router"
import {
  ArrowRight,
  Download,
  Gift,
  type LucideIcon,
  RefreshCw,
  RotateCcw,
  UserCog,
  Vote,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import {
  type DragEvent,
  type ReactElement,
  type ReactNode,
  useState,
} from "react"
import { z } from "zod"

export type LockCardProfile = {
  displayName: string | null
  avatarUrl: string | null
  gaugeAddress: string
}

type LockCardProps = {
  lock: OverviewLock
  nowSeconds: number
  voted: boolean
  profile?: LockCardProfile | undefined
  claimableMicro: bigint
  canMerge: boolean
  onTransfer: () => void
  onMerge: () => void
  onWithdraw: () => void
  onClaim?: (() => void) | undefined
  onRefreshBoost?: (() => void) | undefined
  onDragMerge: (fromId: string, toId: string) => void
}

const dragPayloadSchema = z.object({
  kind: z.enum(["veMEZO", "veBTC"]),
  tokenId: z.string().regex(/^\d+$/),
})

function parseDragPayload(raw: string) {
  try {
    return dragPayloadSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

// React 18 has no typed `inert`; the empty string sets the attribute.
const inertProps = { inert: "" }

function boostLabel(lock: OverviewLock): string | null {
  const unboosted = lock.unboostedVotingPower
  if (!unboosted || unboosted <= 0n || lock.expired) return null
  const hundredths = (lock.votingPower * 100n) / unboosted
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}×`
}

/** J01 lock tile: solid veBTC/veMEZO/expired face that flips to its actions. */
export default function LockCard(props: LockCardProps): ReactElement {
  const { lock, canMerge, onDragMerge } = props
  const [flipped, setFlipped] = useState(false)
  const [dropReady, setDropReady] = useState(false)
  const reducedMotion = useReducedMotion()
  const draggable = !lock.expired && canMerge

  function onDragStart(event: DragEvent<HTMLElement>) {
    event.dataTransfer.setData(
      "text/plain",
      JSON.stringify({ kind: lock.kind, tokenId: lock.id }),
    )
    event.dataTransfer.effectAllowed = "move"
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    if (!draggable) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDropReady(true)
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDropReady(false)
    if (!draggable) return
    const payload = parseDragPayload(event.dataTransfer.getData("text/plain"))
    if (!payload || payload.kind !== lock.kind || payload.tokenId === lock.id)
      return
    onDragMerge(payload.tokenId, lock.id)
  }

  const front = <LockCardFront {...props} onFlip={() => setFlipped(true)} />
  const back = <LockCardBack {...props} onFlip={() => setFlipped(false)} />

  return (
    <li
      className={cn(
        "h-[208px] w-[196px] shrink-0 snap-start list-none rounded-[13px] [perspective:1000px]",
        dropReady && "ring-2 ring-ink ring-offset-2 ring-offset-canvas",
        draggable && !flipped && "cursor-grab active:cursor-grabbing",
      )}
      draggable={draggable && !flipped}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={() => setDropReady(false)}
      onDrop={onDrop}
    >
      {reducedMotion ? (
        flipped ? (
          back
        ) : (
          front
        )
      ) : (
        <motion.div
          className="relative size-full [transform-style:preserve-3d]"
          initial={false}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div
            className="absolute inset-0 [backface-visibility:hidden]"
            {...(flipped ? inertProps : {})}
          >
            {front}
          </div>
          <div
            className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]"
            {...(flipped ? {} : inertProps)}
          >
            {back}
          </div>
        </motion.div>
      )}
    </li>
  )
}

function LockCardFront({
  lock,
  nowSeconds,
  voted,
  profile,
  onWithdraw,
  onFlip,
}: LockCardProps & { onFlip: () => void }): ReactElement {
  const boost = boostLabel(lock)
  const amount = formatLockAmount(lock)
  const token = lock.kind === "veBTC" ? "btc" : "mezo"

  return (
    <article
      className={cn(
        "relative flex size-full flex-col rounded-[13px] px-3.5 pb-3.5 pt-4",
        lock.expired
          ? "bg-expired text-ink"
          : lock.kind === "veBTC"
            ? "bg-accent text-white"
            : "bg-mezo text-white",
      )}
    >
      <button
        type="button"
        className="absolute inset-0 rounded-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        aria-label={`${lock.kind} lock #${lock.id}, ${amount}. Show actions`}
        onClick={onFlip}
      />
      <h3 className="flex h-6 items-center gap-2 text-[15px] font-650 tabular-nums">
        <TokenMark
          kind={token}
          size={22}
          tone="inverse"
          className={cn(
            lock.expired
              ? "[&_svg]:fill-muted"
              : lock.kind === "veMEZO" && "[&_svg]:fill-mezo",
          )}
        />
        <span className="truncate">{amount}</span>
      </h3>

      <div className="mt-[18px] flex items-center justify-between gap-2">
        <p className="flex min-w-0 flex-col gap-[3px]">
          <span
            className={cn(
              "text-[8px] font-600",
              lock.expired ? "text-muted" : "text-white/70",
            )}
          >
            VOTING POWER
          </span>
          <span
            className={cn(
              "truncate text-[14px] font-650 tabular-nums",
              lock.expired && "text-ink-2",
            )}
          >
            {formatVotingPower(lock)}
          </span>
        </p>
        {boost ? (
          <span
            className={cn(
              "shrink-0 rounded bg-white px-[7px] py-[3px] text-[11px] font-700 tabular-nums",
              lock.kind === "veBTC" ? "text-accent-ink" : "text-mezo",
            )}
          >
            {boost}
          </span>
        ) : null}
      </div>

      <div className="flex-1" />
      {profile ? (
        <p className="flex items-center gap-1.5 py-1 text-[11px] font-650">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="size-4 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-4 shrink-0 items-center justify-center rounded-full bg-black/75 text-[8px] font-700 text-white"
            >
              {(profile.displayName ?? "G").slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="truncate">
            {profile.displayName ?? "Claimed gauge"}
          </span>
        </p>
      ) : null}
      <div
        className={cn("h-px", lock.expired ? "bg-black/10" : "bg-white/25")}
      />
      <p
        className={cn(
          "text-[13px] font-700 tabular-nums",
          profile ? "mt-2" : "mt-2.5",
        )}
      >
        #{lock.id}
      </p>
      <div className="mt-1 flex h-5 items-center justify-between gap-2 text-[11px]">
        <span
          className={cn(
            "truncate",
            lock.expired ? "font-600 text-secondary" : "font-550 text-white/90",
          )}
        >
          {lockStatusLabel(lock, nowSeconds)}
        </span>
        {lock.expired ? (
          <button
            type="button"
            onClick={onWithdraw}
            className="relative -mr-1 flex items-center gap-1 rounded px-1 text-[12px] font-650 text-ink hover:bg-black/5"
          >
            <Download size={12} strokeWidth={2} aria-hidden="true" />
            Withdraw
          </button>
        ) : voted ? (
          <span className="flex h-5 items-center rounded bg-white px-[7px] font-700 text-pos">
            Voted
          </span>
        ) : (
          <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
        )}
      </div>
    </article>
  )
}

function LockCardBack({
  lock,
  profile,
  claimableMicro,
  canMerge,
  onTransfer,
  onMerge,
  onWithdraw,
  onClaim,
  onRefreshBoost,
  onFlip,
}: LockCardProps & { onFlip: () => void }): ReactElement {
  const live = !lock.expired

  return (
    <article
      className={cn(
        "flex size-full flex-col rounded-[13px] border bg-line-2 px-3.5 pb-3 pt-3.5 text-ink",
        lock.kind === "veBTC" ? "border-accent" : "border-mezo",
      )}
    >
      <div className="flex h-[22px] items-center justify-between gap-2">
        <h3 className="text-[14px] font-700 tabular-nums">#{lock.id}</h3>
        <button
          type="button"
          onClick={onFlip}
          aria-label={`Show ${lock.kind} lock #${lock.id}`}
          className="-mr-1 flex size-6 items-center justify-center rounded text-secondary hover:bg-black/5 hover:text-ink"
        >
          <RotateCcw size={14} strokeWidth={1.75} />
        </button>
      </div>
      <p className="text-[13px] font-550 text-secondary tabular-nums">
        {formatVotingPower(lock)}
      </p>

      <ul className="mt-1.5 flex flex-col">
        {lock.kind === "veMEZO" && live ? (
          <li>
            <Link to="/vote" className={actionClass}>
              <ActionContent icon={Vote} label="Vote" />
            </Link>
          </li>
        ) : null}
        {claimableMicro > 0n && onClaim ? (
          <li>
            <button type="button" onClick={onClaim} className={actionClass}>
              <ActionContent icon={Gift} label="Claim">
                <span className="ml-auto text-[11px] font-500 text-secondary tabular-nums">
                  {formatMicroUsd(claimableMicro)}
                </span>
              </ActionContent>
            </button>
          </li>
        ) : null}
        {lock.kind === "veBTC" && live && onRefreshBoost ? (
          <li>
            <button
              type="button"
              onClick={onRefreshBoost}
              className={actionClass}
            >
              <ActionContent icon={RefreshCw} label="Refresh boost" />
            </button>
          </li>
        ) : null}
        {lock.kind === "veBTC" && profile ? (
          <li>
            <Link
              to="/gauges/$address"
              params={{ address: profile.gaugeAddress }}
              className={actionClass}
            >
              <ActionContent icon={UserCog} label="Manage profile" />
            </Link>
          </li>
        ) : null}
        {lock.expired ? (
          <li>
            <button type="button" onClick={onWithdraw} className={actionClass}>
              <ActionContent icon={Download} label="Withdraw" />
            </button>
          </li>
        ) : null}
      </ul>

      <div className="mt-auto h-px bg-expired" />
      <div className="mt-2 flex h-6 items-center justify-between text-[13px] font-550">
        <button
          type="button"
          onClick={onTransfer}
          className="-ml-1 rounded px-1 hover:bg-black/5"
        >
          Transfer
        </button>
        {canMerge && live ? (
          <button
            type="button"
            onClick={onMerge}
            className="-mr-1 rounded px-1 hover:bg-black/5"
          >
            Merge
          </button>
        ) : null}
      </div>
    </article>
  )
}

const actionClass =
  "-mx-1 flex h-6 w-[calc(100%+8px)] items-center gap-2 rounded px-1 text-left text-[13px] font-550 hover:bg-black/5"

function ActionContent({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children?: ReactNode
}): ReactElement {
  return (
    <>
      <Icon
        size={14}
        strokeWidth={1.75}
        className="shrink-0 text-ink-2"
        aria-hidden="true"
      />
      {label}
      {children}
    </>
  )
}
