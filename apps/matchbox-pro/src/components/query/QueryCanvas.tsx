import {
  ArrowRightIcon,
  HistoryIcon,
  SearchIcon,
  ShieldIcon,
} from "@/components/ui/Icons"
import type { QueryBlock, QueryResponse } from "@/lib/query/contracts"
import { richSessionBlocks } from "@/lib/query/session"
import { cn } from "@/utils/cn"
import { type FormEvent, useState } from "react"
import { ActivityTrace } from "./blocks/ActivityTrace"
import { AllocationDiff } from "./blocks/AllocationDiff"
import { BridgeRecords } from "./blocks/BridgeRecords"
import { ClarificationCard } from "./blocks/ClarificationCard"
import { GaugeRanking } from "./blocks/GaugeRanking"
import { VoteComposer } from "./blocks/VoteComposer"
import { ZapRoute } from "./blocks/ZapRoute"

function BlockRenderer({
  block,
  wallet,
  onQuery,
}: {
  block: QueryBlock
  wallet: QueryResponse["wallet"]
  onQuery: (query: string) => void
}): JSX.Element | null {
  switch (block.type) {
    case "bridge_records":
      return <BridgeRecords block={block} />
    case "gauge_ranking":
      return <GaugeRanking block={block} />
    case "vote_composer":
      return <VoteComposer block={block} wallet={wallet} />
    case "zap_route":
      return <ZapRoute block={block} wallet={wallet} />
    case "activity_trace":
      return null
    case "allocation_diff":
      return <AllocationDiff diff={block} />
    case "clarification_card":
      return <ClarificationCard block={block} onQuery={onQuery} />
  }
}

export function QueryCanvas({
  response,
  thread,
  onQuery,
  onOpenCommand,
  loading,
  error,
}: {
  response: QueryResponse
  thread: QueryResponse[]
  onQuery: (query: string) => void
  onOpenCommand: () => void
  loading: boolean
  error: string | null
}) {
  const [draft, setDraft] = useState("")
  const traces = response.blocks.filter(
    (block): block is Extract<QueryBlock, { type: "activity_trace" }> =>
      block.type === "activity_trace",
  )
  const clarification = response.blocks.find(
    (block): block is Extract<QueryBlock, { type: "clarification_card" }> =>
      block.type === "clarification_card",
  )
  const richBlocks = richSessionBlocks(thread)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.trim()) return
    onQuery(draft)
    setDraft("")
  }

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6 flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <HistoryIcon className="size-3.5" />
            This tab · {thread.length}{" "}
            {thread.length === 1 ? "query" : "queries"}
          </div>
          <h1 className="text-balance text-2xl font-medium text-ink sm:text-3xl">
            {response.title}
          </h1>
          <p className="mt-2 font-mono text-xs tabular-nums text-muted">
            {response.snapshotLabel}
          </p>
        </div>
        <button
          className="button-secondary shrink-0"
          onClick={onOpenCommand}
          type="button"
        >
          <SearchIcon className="size-4" />
          New Query
          <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-muted">
            ⌘K
          </kbd>
        </button>
      </header>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {loading && (
            <output
              aria-live="polite"
              className="rounded-lg border border-line bg-panel p-5"
            >
              <div className="h-3 w-32 rounded bg-raised" />
              <div className="mt-4 h-12 rounded-md bg-raised" />
              <div className="mt-2 h-12 rounded-md bg-raised" />
              <p className="mt-4 text-sm text-muted">
                Stuart is resolving the wallet and calling Matchbox tools…
              </p>
            </output>
          )}
          {!loading &&
            richBlocks.map((block, index) => (
              <BlockRenderer
                block={block}
                key={`${block.type}-${index}-${"proposalHash" in block ? block.proposalHash : response.id}`}
                onQuery={onQuery}
                wallet={response.wallet}
              />
            ))}
          {!loading && richBlocks.length === 0 && !clarification && (
            <div className="rounded-lg border border-line bg-panel p-8 text-center">
              <p className="text-pretty text-sm text-secondary">
                This result does not have a rich prototype block yet.
              </p>
              <button
                className="button-primary mt-4"
                onClick={onOpenCommand}
                type="button"
              >
                Try a prototype query
              </button>
            </div>
          )}
        </div>

        <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <div className="border-t-2 border-accent bg-panel p-5 xl:rounded-b-lg xl:border-x xl:border-b xl:border-x-line xl:border-b-line">
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex size-9 items-center justify-center rounded-md bg-accent font-mono text-sm font-semibold text-[#0a0a0c]">
                S
              </span>
              <div>
                <p className="text-sm font-medium text-ink">Stuart</p>
                <p className="text-xs text-muted">
                  Mezo agent · sourced answer
                </p>
              </div>
            </div>
            <p className="text-pretty text-sm leading-6 text-secondary">
              {response.answer}
            </p>

            {clarification && (
              <ClarificationCard block={clarification} onQuery={onQuery} />
            )}

            {response.service && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span
                  className={cn(
                    "rounded border px-2 py-1 font-mono",
                    response.service.runtime === "groq"
                      ? "border-positive/30 bg-positive-soft text-positive"
                      : "border-line bg-raised text-secondary",
                  )}
                >
                  {response.service.runtime === "groq"
                    ? "GROQ · LIVE"
                    : "TOOLS · FALLBACK"}
                </span>
                {response.service.model && (
                  <span className="font-mono">
                    {response.service.model.replace("openai/", "")}
                  </span>
                )}
              </div>
            )}

            {response.service?.notice && (
              <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-pretty text-xs leading-5 text-secondary">
                {response.service.notice}
              </p>
            )}

            <div className="mt-5 border-t border-line pt-4">
              <div className="flex items-start gap-2.5">
                <ShieldIcon className="mt-0.5 size-4 shrink-0 text-positive" />
                <div>
                  <p className="text-xs font-medium text-ink">
                    {response.wallet.label}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted">
                    {response.wallet.address}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {response.wallet.network}
                  </p>
                </div>
              </div>
            </div>

            {traces.map((trace) => (
              <ActivityTrace
                block={trace}
                key={trace.items.map((item) => item.label).join("|")}
              />
            ))}

            {response.evidence.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-xs font-medium uppercase text-muted">
                  Sources
                </p>
                <ul className="mt-2 space-y-2">
                  {response.evidence.map((item) => (
                    <li
                      className="flex items-center justify-between gap-3 text-xs"
                      key={`${item.source}-${item.fetchedAt}`}
                    >
                      {item.url ? (
                        <a
                          className="truncate text-secondary underline decoration-line underline-offset-4 hover:text-ink"
                          href={item.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {item.source}
                        </a>
                      ) : (
                        <span className="truncate text-secondary">
                          {item.source}
                        </span>
                      )}
                      <span className="shrink-0 font-mono uppercase text-muted">
                        {item.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase text-muted">
              Follow up
            </p>
            <div className="space-y-1">
              {response.followups.map((followup) => (
                <button
                  className="group flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-sm text-secondary hover:bg-panel hover:text-ink"
                  key={followup}
                  onClick={() => onQuery(followup)}
                  type="button"
                >
                  <span>{followup}</span>
                  <ArrowRightIcon className="size-4 shrink-0 text-muted group-hover:text-accent" />
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <form
        className="sticky bottom-3 z-20 mx-auto mt-8 flex max-w-3xl items-end gap-2 rounded-lg border border-line bg-panel p-2 shadow-xl [padding-bottom:max(0.5rem,env(safe-area-inset-bottom))]"
        onSubmit={submit}
      >
        <label className="sr-only" htmlFor="query-followup">
          Ask a follow-up
        </label>
        <textarea
          aria-label="Ask Stuart a follow-up"
          className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-muted"
          id="query-followup"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder="Ask Stuart a follow-up…"
          rows={1}
          value={draft}
        />
        <button
          aria-label="Send query"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-[#0a0a0c] hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50 sm:size-10"
          disabled={!draft.trim() || loading}
          type="submit"
        >
          <ArrowRightIcon className="size-4" />
        </button>
      </form>
      {error && (
        <p
          className="mx-auto mt-2 max-w-3xl text-pretty text-sm text-warning"
          role="alert"
        >
          {error}. Your previous result is still visible; try again.
        </p>
      )}
    </main>
  )
}
