import { useActivityEnrichment } from "@/hooks/useActivityEnrichment"
import { useWalletTransactions } from "@/hooks/useWalletTransactions"
import { formatActivity } from "@/lib/mezoActivity/format"
import { useWalletAccount } from "@mezo-org/passport"
import { useRouter } from "next/router"
import { useMemo } from "react"

function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = Math.max(now - timestamp, 0)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86_400)}d ago`
}

function ExternalLinkIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

type TransactionsViewProps = {
  onBack?: () => void
}

export default function TransactionsView({
  onBack: _onBack,
}: TransactionsViewProps): JSX.Element {
  const { accountAddress } = useWalletAccount()
  const router = useRouter()
  const {
    data: items,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useWalletTransactions({
    actor: accountAddress,
    limit: 15,
    page: 0,
  })

  const enrichment = useActivityEnrichment(items)
  const rows = useMemo(
    () =>
      items.map((item) => ({
        item,
        fmt: formatActivity(item, enrichment),
      })),
    [items, enrichment],
  )

  const handleViewAll = () => {
    void router.push("/transactions")
  }

  if (!accountAddress) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <p className="text-sm text-[var(--content-secondary)]">
          Complete wallet setup to see your Mezo transactions.
        </p>
        <p className="text-xs text-[var(--content-tertiary)]">
          Transactions are scoped to your EVM smart account, not your Bitcoin
          receive address.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
                key={index}
                className="h-16 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)]"
              />
            ))}
          </div>
        ) : null}

        {isError ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-6 text-center">
            <p className="text-sm text-red-400">
              Failed to load transactions
              {error instanceof Error ? `: ${error.message}` : ""}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--content-primary)] transition-colors hover:bg-[var(--border)]/50 disabled:opacity-50"
            >
              {isFetching ? "Retrying..." : "Retry"}
            </button>
          </div>
        ) : null}

        {!isLoading && !isError && rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-8 text-center">
            <p className="text-sm font-medium text-[var(--content-primary)]">
              No activity yet
            </p>
            <p className="text-xs text-[var(--content-tertiary)]">
              Your locks, votes, claims, and capital moves will show up here.
            </p>
            <a
              href="/activity"
              className="mt-2 text-xs text-[#F7931A] no-underline hover:underline"
            >
              Explore protocol activity
            </a>
          </div>
        ) : null}

        {!isLoading && !isError && rows.length > 0 ? (
          <ul className="space-y-2">
            {rows.map(({ item, fmt }) => (
              <li key={item.id}>
                <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3 transition-colors hover:bg-[var(--border)]/40">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[var(--surface)] text-base"
                  >
                    {fmt.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--content-primary)]">
                      {fmt.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--content-tertiary)]">
                      <span>{formatRelativeTime(item.timestamp)}</span>
                      {fmt.amount ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-[var(--content-secondary)]">
                            {fmt.amount}
                            {fmt.amountSubtext ? ` ${fmt.amountSubtext}` : ""}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {item.explorerUrl || item.txHash ? (
                    <a
                      href={
                        item.explorerUrl ??
                        `https://explorer.mezo.org/tx/${item.txHash}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[var(--content-tertiary)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--content-primary)]"
                      aria-label="View on explorer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ExternalLinkIcon />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-[var(--border)] p-4">
        <button
          type="button"
          onClick={handleViewAll}
          className="flex w-full items-center justify-center rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] py-3 text-sm font-semibold text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
        >
          View all
        </button>
      </div>
    </div>
  )
}
