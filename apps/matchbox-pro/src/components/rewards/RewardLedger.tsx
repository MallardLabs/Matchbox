import Button from "@/components/ui/Button"
import { formatMicroUsd, formatTokenAmountDigits } from "@/lib/money"
import { Link } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { type ReactElement, type ReactNode, useState } from "react"
import type { RewardRow } from "./rewardRows"

const PAGE_SIZE = 8
const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
})

type RewardLedgerProps = {
  status: "loading" | "disconnected" | "error" | "ready"
  rows: RewardRow[]
  incomplete: boolean
  updatedAt: number
  onConnect: () => void
  onRetry: () => void
}

const headClass = "pb-2 pr-3 text-[11px] font-400 text-muted"
const cellClass = "py-2.5 pr-3 text-[12px]"

/** Pen "Ledger": unclaimed token balances by source and lock, filterable and paged. */
export default function RewardLedger({
  status,
  rows,
  incomplete,
  updatedAt,
  onConnect,
  onRetry,
}: RewardLedgerProps): ReactElement {
  const [filter, setFilter] = useState("")
  const [page, setPage] = useState(0)
  const query = filter.trim().toLowerCase()
  const filtered = query
    ? rows.filter((row) =>
        `${row.name} ${row.symbol} ${row.tokenId} ${row.gauge}`
          .toLowerCase()
          .includes(query),
      )
    : rows
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)

  return (
    <section aria-labelledby="ledger-heading" className="flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-3">
        <h2 id="ledger-heading" className="text-[14px] font-600 text-ink">
          Reward ledger
        </h2>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          {updatedAt > 0 ? (
            <time
              dateTime={new Date(updatedAt).toISOString()}
              className="font-mono text-[11px] text-muted"
            >
              {timeFormat.format(updatedAt)}
            </time>
          ) : null}
          <label className="relative w-full sm:w-56">
            <span className="sr-only">Filter reward sources</span>
            <Search
              aria-hidden="true"
              size={13}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              placeholder="Source, token or lock"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value)
                setPage(0)
              }}
              className="h-8 w-full rounded-md border border-line bg-inset pl-8 pr-2.5 text-[12px] text-ink outline-none placeholder:text-muted focus-visible:border-accent-line"
            />
          </label>
        </div>
      </div>

      {status === "loading" ? (
        <ul
          aria-label="Loading rewards"
          aria-busy="true"
          className="flex flex-col gap-2 border-t border-line pt-3"
        >
          {["a", "b", "c"].map((key) => (
            <li
              key={key}
              className="h-9 animate-pulse rounded bg-inset motion-reduce:animate-none"
            />
          ))}
        </ul>
      ) : status === "disconnected" ? (
        <Empty
          title="Not connected"
          action={<Button onClick={onConnect}>Connect wallet</Button>}
        />
      ) : status === "error" ? (
        <Empty
          title="Rewards unavailable"
          action={<Button onClick={onRetry}>Try again</Button>}
        />
      ) : filtered.length === 0 ? (
        <Empty
          title={
            query
              ? "No matches"
              : incomplete
                ? "Some sources unavailable"
                : "No claimable rewards"
          }
          action={
            query ? (
              <Button variant="secondary" onClick={() => setFilter("")}>
                Clear search
              </Button>
            ) : (
              <Link
                to="/vote"
                className="inline-flex h-[34px] items-center rounded-[7px] bg-accent px-4 text-[12px] font-700 text-on-accent hover:brightness-95"
              >
                Explore gauges
              </Link>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr>
                <th scope="col" className={headClass}>
                  Source
                </th>
                <th scope="col" className={headClass}>
                  Lock
                </th>
                <th scope="col" className={`${headClass} text-right`}>
                  Native
                </th>
                <th scope="col" className={`${headClass} text-right`}>
                  USD now
                </th>
                <th scope="col" className={`${headClass} w-[88px] pl-3`}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                .map((row) => (
                  <tr
                    key={row.key}
                    className="border-t border-line last:border-b"
                  >
                    <td className={`${cellClass} text-ink`}>
                      <Link
                        to="/gauges/$address"
                        params={{ address: row.gauge }}
                        className="hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className={`${cellClass} font-mono text-secondary`}>
                      veMEZO #{row.tokenId.toString()}
                    </td>
                    <td
                      className={`${cellClass} text-right font-mono text-ink`}
                    >
                      {formatTokenAmountDigits(row.earned, row.decimals, 6)}{" "}
                      {row.symbol}
                    </td>
                    <td
                      className={`${cellClass} text-right font-mono text-secondary`}
                    >
                      {row.priceAvailable
                        ? formatMicroUsd(row.usdMicro)
                        : "Unpriced"}
                    </td>
                    <td
                      className={`${cellClass} pl-3 font-600 text-accent-ink`}
                    >
                      Claimable
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {status === "ready" && filtered.length > PAGE_SIZE ? (
        <nav
          aria-label="Reward ledger pages"
          className="flex items-center justify-end gap-2 pt-3 text-[12px] text-secondary"
        >
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </Button>
          <span className="font-mono tabular-nums">
            {currentPage + 1} / {pageCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage + 1 >= pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </section>
  )
}

function Empty({
  title,
  action,
}: {
  title: string
  action: ReactNode
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-6">
      <h3 className="text-[14px] font-600 text-ink">{title}</h3>
      {action}
    </div>
  )
}
