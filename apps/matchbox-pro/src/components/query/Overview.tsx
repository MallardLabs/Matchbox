import {
  ArrowRightIcon,
  BoltIcon,
  ClockIcon,
  RewardsIcon,
  VoteIcon,
} from "@/components/ui/Icons"

export function Overview({ onQuery }: { onQuery: (query: string) => void }) {
  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <header className="flex flex-col gap-5 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase text-muted">
            <span className="size-2 rounded-full bg-positive" />
            Stuart Query · live connections
          </div>
          <h1 className="text-balance text-3xl font-medium text-ink">
            Ask Mezo. Act with confidence.
          </h1>
          <p className="mt-2 max-w-2xl text-pretty text-sm text-secondary">
            Search Matchbox, inspect any public wallet, compare current gauges,
            and prepare user-confirmed actions from one command surface.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3">
          <ClockIcon className="size-4 text-muted" />
          <div>
            <p className="text-xs text-muted">Data freshness</p>
            <p className="font-mono text-sm font-medium tabular-nums text-ink">
              Refreshed per Query
            </p>
          </div>
        </div>
      </header>

      <section aria-labelledby="priority-actions-heading" className="py-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-muted">Now</p>
            <h2
              className="text-balance text-lg font-medium text-ink"
              id="priority-actions-heading"
            >
              Priority actions
            </h2>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted">
            2 open
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-line bg-panel">
          <button
            className="group grid min-h-24 w-full gap-4 border-b border-line p-5 text-left hover:bg-raised md:grid-cols-[40px_minmax(0,1fr)_auto] md:items-center"
            onClick={() => onQuery("vote on the best gauges this epoch for me")}
            type="button"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent">
              <VoteIcon className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-medium text-ink">
                Optimize this wallet’s gauge votes
              </span>
              <span className="mt-1 block text-sm text-secondary">
                Compare live incentives, current weights, and eligible ve
                positions.
              </span>
            </span>
            <span className="flex items-center gap-2 text-sm font-medium text-accent">
              Optimize vote
              <ArrowRightIcon className="size-4" />
            </span>
          </button>

          <button
            className="group grid min-h-24 w-full gap-4 p-5 text-left hover:bg-raised md:grid-cols-[40px_minmax(0,1fr)_auto] md:items-center"
            onClick={() => onQuery("deposit 50 MUSD into Savings")}
            type="button"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-md bg-positive-soft text-positive">
              <BoltIcon className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-medium text-ink">
                Deposit into MUSD Savings
              </span>
              <span className="mt-1 block text-sm text-secondary">
                Check the live balance and allowance, then simulate exact calls.
              </span>
            </span>
            <span className="flex items-center gap-2 text-sm font-medium text-accent">
              Prepare deposit
              <ArrowRightIcon className="size-4" />
            </span>
          </button>
        </div>
      </section>

      <section className="grid gap-6 border-t border-line py-8 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-muted">
            Live gauge intelligence
          </p>
          <p className="max-w-sm text-pretty text-sm leading-6 text-secondary">
            Rank boost, pool, vault, and validator gauges by deposited
            incentives or eight-epoch funding consistency.
          </p>
          <button
            className="button-secondary mt-5"
            onClick={() => onQuery("which gauges have the most incentives")}
            type="button"
          >
            <RewardsIcon className="size-4" />
            Rank gauges
          </button>
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Wallet intelligence</p>
            <button
              className="button-ghost"
              onClick={() => onQuery("wormhole transactions")}
              type="button"
            >
              Ask Stuart
            </button>
          </div>
          <div className="border-y border-line py-4">
            <p className="text-pretty text-sm leading-6 text-secondary">
              Stuart follows only provider-linked cross-chain journeys and keeps
              watched or inspected wallets read-only. Query the selected address
              to render sourced transaction cards here.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
