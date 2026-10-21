import { TABLET_UP_QUERY, useMediaQuery } from "@/hooks/useMediaQuery"
import { cn } from "@repo/ui/cn"
import * as TokenMark from "@repo/ui/token-mark"
import { ArrowRight, Check, Download, RotateCcw } from "lucide-react"
import { type ReactElement, useEffect, useId, useRef, useState } from "react"
import LockActionList from "./LockActionList"
import { useLockFlows } from "./LockFlows"
import {
  type LockView,
  boostLabel,
  exactLockAmount,
  formatLockAmount,
  formatVotingPower,
  lockStatus,
} from "./lockModel"

// React 18 types have no `inert`; the empty string sets the attribute.
const inert = { inert: "" }

// 24px on the tile, with a 44px-tall hit area in the card's bottom padding.
const footerAction =
  "relative -mx-1 h-6 rounded-md px-1 transition-colors after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] hover:bg-ink/5"

/**
 * J01/J02 lock tile. Face-up shows the position; activating it flips to the
 * face-down action list (tablet and up) or opens the actions sheet (phones).
 */
export default function LockCard({
  lock,
  nowSeconds,
  canMerge,
}: {
  lock: LockView
  nowSeconds: bigint
  canMerge: boolean
}): ReactElement {
  const tabletUp = useMediaQuery(TABLET_UP_QUERY)
  const { open } = useLockFlows()
  const [flipped, setFlipped] = useState(false)
  const frontButton = useRef<HTMLButtonElement>(null)
  const backFace = useRef<HTMLDivElement>(null)
  const userFlip = useRef(false)
  const backId = useId()
  const showBack = flipped && tabletUp

  useEffect(() => {
    if (!userFlip.current) return
    userFlip.current = false
    // After the faces swap `inert`/visibility, move focus to the shown face.
    const frame = window.requestAnimationFrame(() => {
      if (showBack) {
        const face = backFace.current
        const target =
          face?.querySelector<HTMLElement>("[data-first-action] button") ??
          face?.querySelector<HTMLElement>("button")
        target?.focus()
      } else {
        frontButton.current?.focus()
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [showBack])

  function flip(next: boolean): void {
    userFlip.current = true
    setFlipped(next)
  }

  const amount = formatLockAmount(lock.kind, lock.amount)
  const exact = exactLockAmount(lock.kind, lock.amount)
  const status = lockStatus(lock, nowSeconds)

  return (
    <div className="relative h-[168px] w-[156px] [perspective:1000px] md:h-[208px] md:w-[196px]">
      <div
        className={cn(
          "relative size-full transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] [transform-style:preserve-3d] motion-reduce:transition-none motion-reduce:[transform:none]",
          showBack && "[transform:rotateY(180deg)]",
        )}
      >
        <div
          className={cn(
            "absolute inset-0 transition-none [backface-visibility:hidden]",
            showBack && "motion-reduce:opacity-0",
          )}
          {...(showBack ? inert : {})}
        >
          <LockFace
            lock={lock}
            amount={amount}
            status={status}
            nowSeconds={nowSeconds}
            tabletUp={tabletUp}
          />
          <button
            ref={frontButton}
            type="button"
            aria-label={`${lock.kind} #${lock.id}, ${amount.startsWith("<") ? exact : amount}, ${status}. Actions`}
            title={exact}
            {...(tabletUp
              ? { "aria-expanded": showBack, "aria-controls": backId }
              : { "aria-haspopup": "dialog" as const })}
            onClick={() =>
              tabletUp ? flip(true) : open({ type: "actions", lock })
            }
            className="absolute inset-0 rounded-[13px] transition-[box-shadow] hover:shadow-pop focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          />
          {lock.expired ? (
            <WithdrawShortcut lock={lock} tabletUp={tabletUp} />
          ) : null}
        </div>

        {tabletUp ? (
          <div
            id={backId}
            ref={backFace}
            className={cn(
              "absolute inset-0 transition-none [backface-visibility:hidden] [transform:rotateY(180deg)] motion-reduce:[transform:none]",
              !showBack && "motion-reduce:opacity-0",
            )}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation()
                flip(false)
              }
            }}
            {...(showBack ? {} : inert)}
          >
            <article
              aria-label={`${lock.kind} #${lock.id} actions`}
              className="flex size-full flex-col rounded-[13px] bg-line-2 px-3.5 pb-3 pt-3.5 text-ink"
            >
              <header className="flex h-[22px] items-center justify-between gap-2">
                <h3 className="m-0 text-body font-700 tabular-nums">
                  #{lock.id}
                </h3>
                <button
                  type="button"
                  onClick={() => flip(false)}
                  aria-label={`Show the front of #${lock.id}`}
                  className="relative -mr-1 flex size-6 items-center justify-center rounded-md text-secondary transition-colors after:absolute after:-inset-2.5 after:content-[''] hover:bg-ink/5 hover:text-ink"
                >
                  <RotateCcw aria-hidden="true" size={14} strokeWidth={1.75} />
                </button>
              </header>
              <p className="m-0 text-body-sm tabular-nums text-secondary">
                {formatVotingPower(lock.kind, lock.votingPower)}
              </p>
              <div data-first-action className="mt-1.5 min-h-0 flex-1">
                <LockActionList lock={lock} variant="card" />
              </div>
              <div className="h-px shrink-0 bg-ink/15" />
              <footer className="mt-2 flex h-6 shrink-0 items-center justify-between text-body-sm font-400">
                <button
                  type="button"
                  onClick={() => open({ type: "transfer", lock })}
                  className={footerAction}
                >
                  Transfer
                </button>
                {canMerge ? (
                  <button
                    type="button"
                    onClick={() => open({ type: "merge", lock })}
                    className={footerAction}
                  >
                    Merge
                  </button>
                ) : null}
              </footer>
            </article>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function LockFace({
  lock,
  amount,
  status,
  nowSeconds,
  tabletUp,
}: {
  lock: LockView
  amount: string
  status: string
  nowSeconds: bigint
  tabletUp: boolean
}): ReactElement {
  const boost = lock.expired
    ? null
    : boostLabel(lock.votingPower, lock.unboostedVotingPower)
  const tinted = !lock.expired
  const style = tabletUp ? "long" : "short"

  return (
    <article
      aria-hidden="true"
      className={cn(
        "flex size-full flex-col rounded-[13px] px-3 pb-3 pt-3.5 md:px-3.5 md:pb-3.5 md:pt-4",
        lock.expired
          ? "bg-expired text-ink"
          : lock.kind === "veBTC"
            ? "bg-vebtc text-on-card"
            : "bg-vemezo text-on-card",
      )}
    >
      <p className="m-0 flex h-5 items-center gap-[7px] md:h-6 md:gap-2">
        <TokenMark.Root
          kind={lock.kind === "veBTC" ? "btc" : "mezo"}
          size={tabletUp ? 22 : 20}
          tone="inverse"
          className={cn(lock.expired && "[&_svg]:fill-muted")}
        />
        <span className="truncate text-body-sm font-500 tabular-nums md:text-nav">
          {tabletUp ? amount : formatLockAmount(lock.kind, lock.amount, style)}
        </span>
      </p>

      <div className="mt-4 flex items-center justify-between gap-2 md:mt-[18px]">
        <p className="m-0 flex min-w-0 flex-col gap-[3px]">
          <span
            className={cn(
              "text-[8px] font-600 uppercase leading-[10px] tracking-[0.05em]",
              tinted ? "text-on-card/75" : "text-secondary",
            )}
          >
            Voting power
          </span>
          <span
            className={cn(
              "truncate text-body-sm font-500 tabular-nums md:text-body",
              !tinted && "text-ink-2",
            )}
          >
            {formatVotingPower(lock.kind, lock.votingPower, style)}
          </span>
        </p>
        {boost && tabletUp ? (
          <span className="shrink-0 rounded bg-white/90 px-[7px] py-[3px] text-caption font-700 tabular-nums text-on-card">
            {boost}
          </span>
        ) : null}
      </div>

      <div className="flex-1" />
      {lock.profile && tabletUp ? (
        <p className="m-0 flex items-center gap-1.5 py-1 text-caption font-500">
          {lock.profile.profile_picture_url ? (
            <img
              src={lock.profile.profile_picture_url}
              alt=""
              className="size-4 shrink-0 rounded-full bg-white/60 object-cover"
            />
          ) : (
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-on-card text-[8px] font-700 text-vebtc">
              {(lock.profile.display_name ?? "G").trim().slice(0, 1)}
            </span>
          )}
          <span className="truncate">
            {lock.profile.display_name ?? "Gauge"}
          </span>
        </p>
      ) : null}
      <div
        className={cn("h-px shrink-0", tinted ? "bg-on-card/25" : "bg-ink/15")}
      />
      <div className="flex items-end justify-between gap-2 pt-2 md:pt-2.5">
        <p className="m-0 flex min-w-0 flex-col gap-0.5 md:gap-1">
          <span className="text-label font-700 tabular-nums md:text-body-sm">
            #{lock.id}
          </span>
          <span
            className={cn(
              "truncate text-micro md:text-caption",
              tinted ? "text-on-card/85" : "font-600 text-secondary",
            )}
          >
            {tabletUp ? status : lockStatus(lock, nowSeconds, "short")}
          </span>
        </p>
        {lock.expired ? null : lock.votedThisEpoch ? (
          <span className="mb-px flex h-5 shrink-0 items-center gap-1 rounded bg-white/90 px-1.5 text-caption font-700 text-on-card">
            <Check aria-hidden="true" size={11} strokeWidth={2.5} />
            Voted
          </span>
        ) : (
          <ArrowRight
            aria-hidden="true"
            size={14}
            strokeWidth={1.75}
            className="mb-px shrink-0"
          />
        )}
      </div>
    </article>
  )
}

/** Expired face: Withdraw sits on the card itself (J01 #108). */
function WithdrawShortcut({
  lock,
  tabletUp,
}: {
  lock: LockView
  tabletUp: boolean
}): ReactElement | null {
  const { runAction } = useLockFlows()
  if (!tabletUp) return null
  return (
    <button
      type="button"
      onClick={() => runAction(lock, "withdraw")}
      className="absolute bottom-3 right-3 flex h-6 items-center gap-1 rounded-md px-1.5 text-label font-500 text-ink transition-colors hover:bg-ink/10"
    >
      <Download aria-hidden="true" size={13} strokeWidth={1.75} />
      Withdraw
      <span className="sr-only">
        {lock.kind} #{lock.id}
      </span>
    </button>
  )
}
