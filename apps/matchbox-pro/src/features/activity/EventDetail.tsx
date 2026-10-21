import { formatEpochDate } from "@/features/rewards/ledgerModel"
import { formatVeAmount } from "@/lib/money"
import { cn } from "@repo/ui/cn"
import { useCopy } from "@repo/ui/use-copy"
import type { ReactElement, ReactNode } from "react"
import {
  type ActivityEvent,
  type Names,
  allocation,
  allocationText,
  eventAmount,
  eventTitle,
  formatWhen,
  permalinkPath,
  powerUsed,
} from "./activityModel"

type EventDetailProps = {
  event: ActivityEvent
  names: Names
  /** Wallet the permalink is scoped to (the viewed wallet or the tx sender). */
  address: string | null
  stale: boolean
  explorer: string | undefined
  /** Desktop side panel draws its own card; the sheet does not. */
  framed?: boolean
  /** Renders the title as the sheet's dialog title. */
  renderTitle?: (title: string) => ReactNode
}

const KIND_NOTE: Record<ActivityEvent["kind"], string> = {
  voted: "Boost-gauge ballot",
  pool_ballot: "Pool ballot",
  validator_ballot: "Validator ballot",
  vote_reset: "Ballot reset",
  claimed: "Reward claim",
  incentive_deposited: "Incentive deposit · non-refundable",
  boost_refreshed: "veBTC boost refresh",
  lock_created: "New lock",
  lock_increased: "Lock amount",
  lock_extended: "Lock duration",
  lock_merged: "Merge · irreversible",
  lock_withdrawn: "Withdrawal",
  lock_permanent: "Auto max-lock on",
  lock_unlocked: "Auto max-lock off",
  lock_transferred: "Lock transfer",
  profile_published: "Gauge profile",
  protocol: "Protocol event",
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`
}

function groupThousands(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** Selected event: when, epoch, block, tx, power, allocation, links. */
export default function EventDetail({
  event,
  names,
  address,
  stale,
  explorer,
  framed = true,
  renderTitle,
}: EventDetailProps): ReactElement {
  const title = eventTitle(event, names)
  const power = powerUsed(event)
  const escrow = event.items[0]?.escrow ?? null
  const amount = eventAmount(event)
  const lines = allocation(event, names)
  const permalink =
    address && event.txHash ? permalinkPath(address, event.txHash) : null

  const rows: Array<{ label: string; value: ReactNode; mono?: boolean }> = [
    { label: "When", value: `${formatWhen(event.timestamp)} UTC` },
    { label: "Epoch", value: formatEpochDate(event.epochStart) },
  ]
  if (event.blockNumber > 0n) {
    rows.push({
      label: "Block",
      value: `${groupThousands(event.blockNumber)} · ${stale ? "stale" : "final"}`,
      mono: true,
    })
  }
  if (event.txHash) {
    rows.push({ label: "Tx", value: shortHash(event.txHash), mono: true })
  }
  if (power !== null) {
    rows.push({
      label: "Power used",
      value: `${formatVeAmount(power)} ${escrow ?? "ve"}`,
    })
  }
  if (amount) rows.push({ label: "Amount", value: amount })

  return (
    <section
      aria-label="Selected event"
      className={cn(
        "flex min-w-0 flex-col gap-2.5",
        framed && "rounded-lg border border-line p-4",
      )}
    >
      <p className="text-caption text-muted">Selected event</p>
      {renderTitle ? (
        renderTitle(title)
      ) : (
        <h2 className="text-lead font-600 text-ink">{title}</h2>
      )}
      <p className="-mt-1 text-label text-secondary">
        {stale
          ? `${KIND_NOTE[event.kind]} · index lagging`
          : KIND_NOTE[event.kind]}
      </p>
      <dl className="m-0 flex flex-col">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 border-b border-line py-1.5"
          >
            <dt className="text-label text-muted">{row.label}</dt>
            <dd
              className={cn(
                "m-0 truncate text-right text-label text-ink tabular-nums",
                row.mono && "font-mono",
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {lines.length > 0 ? (
        <p className="text-label leading-4 text-ink">
          <span className="text-muted">Allocation</span>{" "}
          {allocationText(lines, lines.length)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-0.5">
        {permalink ? <CopyPermalink path={permalink} /> : null}
        {explorer && event.txHash ? (
          <>
            <a
              href={`${explorer}/tx/${event.txHash}`}
              target="_blank"
              rel="noreferrer"
              className={linkButton}
            >
              Explorer
            </a>
            <a
              href={`${explorer}/tx/${event.txHash}?tab=logs`}
              target="_blank"
              rel="noreferrer"
              className={linkButton}
            >
              Raw log
            </a>
          </>
        ) : null}
      </div>
    </section>
  )
}

const linkButton =
  "inline-flex h-7 items-center rounded-md border border-line px-2.5 text-caption text-ink transition-colors hover:bg-inset"

function CopyPermalink({ path }: { path: string }): ReactElement {
  const { state, copy } = useCopy(`${window.location.origin}${path}`)
  return (
    <button type="button" className={linkButton} onClick={() => void copy()}>
      <span aria-live="polite">
        {state === "copied"
          ? "Copied"
          : state === "failed"
            ? "Copy failed"
            : "Copy permalink"}
      </span>
    </button>
  )
}
