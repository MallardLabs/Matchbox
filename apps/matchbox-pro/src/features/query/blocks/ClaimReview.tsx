import type { ReactElement } from "react"
import type { ClaimReviewBlock } from "../contract"
import { formatToken, formatUsd } from "../format"

export const CLAIM_SOURCE_COPY: Record<
  ClaimReviewBlock["rows"][number]["source"],
  string
> = {
  boost_bribes: "Boost incentives",
  pool_fees_bribes: "Pool fees",
  validator_bribes: "Validator incentives",
  collateral_surplus: "BTC surplus",
}

/** Claimable rewards (or BTC surplus) by source, priced where possible. */
export function ClaimReview({
  block,
}: {
  block: ClaimReviewBlock
}): ReactElement {
  const total =
    block.totalUsd === null
      ? "Unpriced"
      : `${block.unpricedCount > 0 ? "≥ " : ""}${formatUsd(block.totalUsd)}`
  return (
    <section aria-label="Claimable" className="flex flex-col gap-1.5">
      <p className="m-0 flex items-baseline justify-between gap-4 pb-1 text-body font-600 tabular-nums text-ink">
        <span>Claimable</span>
        <span>{total}</span>
      </p>
      <ul className="m-0 list-none p-0">
        {block.rows.map((row) => (
          <li
            key={row.rowKey}
            className="flex items-baseline gap-3 border-b border-line py-2 text-body-sm tabular-nums"
          >
            <span className="min-w-0 flex-1 truncate text-ink">
              {CLAIM_SOURCE_COPY[row.source]}
              {row.tokenId ? (
                <span className="text-muted"> · #{row.tokenId}</span>
              ) : null}
            </span>
            <span className="hidden min-w-0 truncate text-label text-secondary sm:block">
              {row.rewards
                .map((reward) => formatToken(reward.amount))
                .join(" · ")}
            </span>
            <span className="w-24 shrink-0 text-right text-ink">
              {row.usd === null ? "Unpriced" : formatUsd(row.usd)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
