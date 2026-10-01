import { cn } from "@/lib/cn"
import type { RewardClaim } from "@/lib/rewardClaims"
import { ExternalLink } from "lucide-react"
import type { ReactElement } from "react"

const STATUS_LABEL: Record<RewardClaim["status"], string> = {
  pending: "Confirming",
  confirmed: "Confirmed",
  reverted: "Reverted",
}

const STATUS_TONE: Record<RewardClaim["status"], string> = {
  pending: "text-muted",
  confirmed: "text-pos",
  reverted: "text-neg",
}

type RecentClaimsProps = {
  rows: RewardClaim[]
  explorer: string | undefined
  receiptError: boolean
}

const timeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

/** Right-hand panel in the Pen's "Rewards split": claims sent from this browser, newest first. */
export default function RecentClaims({
  rows,
  explorer,
  receiptError,
}: RecentClaimsProps): ReactElement {
  const recent = rows.slice(-6).reverse()
  return (
    <section
      aria-labelledby="recent-claims-heading"
      className="flex w-full flex-col gap-2.5 lg:w-[420px] lg:shrink-0"
    >
      <h2
        id="recent-claims-heading"
        className="text-[14px] font-650 text-ink-2"
      >
        Recent claims
      </h2>
      {recent.length === 0 ? (
        <p className="rounded-[10px] bg-raised p-4 text-[13px] text-muted">
          No claims yet
        </p>
      ) : (
        <ul>
          {recent.map((row) => (
            <li
              key={row.hash}
              className="flex items-center gap-3 border-b border-line py-2.5 text-[12px]"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-[13px] font-500 text-ink">
                  veMEZO #{row.tokenId}
                </p>
                <time
                  dateTime={new Date(row.submittedAt).toISOString()}
                  className="font-mono text-[11px] text-muted"
                >
                  {timeFormat.format(row.submittedAt)}
                </time>
              </div>
              <span className={cn("font-600", STATUS_TONE[row.status])}>
                {STATUS_LABEL[row.status]}
              </span>
              {explorer ? (
                <a
                  href={`${explorer}/tx/${row.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`View claim transaction for veMEZO #${row.tokenId}`}
                  className="rounded p-1 text-muted transition-colors hover:bg-inset hover:text-ink"
                >
                  <ExternalLink
                    aria-hidden="true"
                    size={14}
                    strokeWidth={1.75}
                  />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {receiptError ? (
        <p role="alert" className="text-pretty text-[12px] text-neg">
          Status check unavailable · don't resubmit
        </p>
      ) : null}
    </section>
  )
}
