import { ArrowRightIcon, CloseIcon, SearchIcon } from "@/components/ui/Icons"
import * as Dialog from "@radix-ui/react-dialog"
import { useMemo, useRef, useState } from "react"

const suggestions = [
  {
    label: "Wormhole transactions",
    description: "Find explicitly linked Wormhole bridge journeys",
    group: "Your activity",
  },
  {
    label: "Vote on the best gauges this epoch",
    description: "Optimize projected personal incentive return",
    group: "Actions",
  },
  {
    label: "Put $50 into the MEZO/MUSD vault",
    description: "Check for an approved swap-and-deposit route",
    group: "Actions",
  },
  {
    label: "Deposit 50 MUSD into Savings",
    description: "Check balance, allowance, and simulate the direct deposit",
    group: "Actions",
  },
  {
    label: "Which gauges consistently have good incentives?",
    description: "Compare the last eight completed epochs",
    group: "Answers",
  },
]

export function CommandPalette({
  open,
  onOpenChange,
  onSubmit,
  onShowOverview,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (query: string) => void
  onShowOverview: () => void
}) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized
      ? suggestions.filter(
          (suggestion) =>
            suggestion.label.toLowerCase().includes(normalized) ||
            suggestion.description.toLowerCase().includes(normalized),
        )
      : suggestions
  }, [query])

  function submit(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setQuery("")
    onOpenChange(false)
  }

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content
          className="fixed left-1/2 top-[10vh] z-50 w-[min(680px,calc(100%-24px))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <Dialog.Title className="sr-only">
            Search Matchbox or ask Stuart
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Navigate Matchbox, inspect Mezo activity, or prepare a transaction.
          </Dialog.Description>

          <form
            className="flex min-h-16 items-center gap-3 border-b border-line px-4"
            onSubmit={(event) => {
              event.preventDefault()
              submit(query)
            }}
          >
            <SearchIcon className="size-5 shrink-0 text-muted" />
            <label className="sr-only" htmlFor="query-command-input">
              Search Matchbox or ask Stuart
            </label>
            <input
              aria-label="Search Matchbox or ask Stuart"
              className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
              id="query-command-input"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Matchbox or ask Stuart…"
              ref={inputRef}
              value={query}
            />
            <Dialog.Close
              aria-label="Close Query"
              className="inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink"
            >
              <CloseIcon className="size-4" />
            </Dialog.Close>
          </form>

          <div className="max-h-[min(64vh,560px)] overflow-y-auto p-2">
            {!query && (
              <section aria-labelledby="go-to-heading" className="mb-2">
                <h2
                  className="px-3 pb-1 pt-2 text-xs font-medium uppercase text-muted"
                  id="go-to-heading"
                >
                  Go to
                </h2>
                <button
                  className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-raised"
                  onClick={() => {
                    onShowOverview()
                    onOpenChange(false)
                  }}
                  type="button"
                >
                  <span className="flex-1 text-sm font-medium text-ink">
                    Overview
                  </span>
                  <span className="text-xs text-muted">Matchbox Pro home</span>
                  <ArrowRightIcon className="size-4 text-muted" />
                </button>
              </section>
            )}

            <section aria-labelledby="suggested-heading">
              <h2
                className="px-3 pb-1 pt-2 text-xs font-medium uppercase text-muted"
                id="suggested-heading"
              >
                {query ? "Matching commands" : "Try asking Stuart"}
              </h2>
              <div className="space-y-1">
                {matches.map((suggestion) => (
                  <button
                    className="group flex min-h-14 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-raised"
                    key={suggestion.label}
                    onClick={() => submit(suggestion.label)}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {suggestion.label}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {suggestion.description}
                      </span>
                    </span>
                    <span className="hidden text-xs text-muted sm:block">
                      {suggestion.group}
                    </span>
                    <ArrowRightIcon className="size-4 text-muted group-hover:text-accent" />
                  </button>
                ))}
                {matches.length === 0 && (
                  <button
                    className="flex min-h-14 w-full items-center gap-3 rounded-md bg-raised px-3 text-left"
                    onClick={() => submit(query)}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">
                        Ask Stuart
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {query}
                      </span>
                    </span>
                    <ArrowRightIcon className="size-4 text-accent" />
                  </button>
                )}
              </div>
            </section>
          </div>

          <footer className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
            <span>One wallet active · public chain data</span>
            <span className="font-mono">↵ run · esc close</span>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
