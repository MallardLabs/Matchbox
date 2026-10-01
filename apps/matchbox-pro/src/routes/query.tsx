import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowUp, Search } from "lucide-react"
import { type FormEvent, type ReactElement, useState } from "react"

export const Route = createFileRoute("/query")({
  component: QueryPage,
})

const actionClass =
  "inline-flex h-9 items-center rounded-md px-3.5 text-[13px] transition-[filter,border-color]"

function QueryPage(): ReactElement {
  const [query, setQuery] = useState("")
  const [asked, setAsked] = useState<string | null>(null)
  const canSend = query.trim().length > 0

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!canSend) return
    setAsked(query.trim())
    setQuery("")
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-balance text-[22px] font-600 text-ink">
        {asked ?? "Ask Stuart"}
      </h1>

      {asked ? (
        <section
          aria-labelledby="query-answer"
          className="flex flex-col gap-4 border-b border-line pb-4"
        >
          <h2 id="query-answer" className="sr-only">
            Answer
          </h2>
          <p className="mt-4 self-start rounded-md bg-inset px-2 py-1 text-[12px] font-600 text-secondary">
            Unavailable in Preview
          </p>
          <div className="flex items-center gap-2">
            <Link
              to="/vote"
              className={`${actionClass} bg-accent font-600 text-on-accent hover:brightness-95`}
            >
              Open Vote
            </Link>
            <Link
              to="/rewards"
              className={`${actionClass} border border-line text-ink hover:border-line-2`}
            >
              Open Rewards
            </Link>
          </div>
        </section>
      ) : null}

      <form
        onSubmit={submit}
        className="flex h-11 items-center gap-2.5 rounded-lg bg-inset px-3.5 focus-within:ring-1 focus-within:ring-line-2"
      >
        <Search
          size={16}
          strokeWidth={1.75}
          className="shrink-0 text-secondary"
          aria-hidden="true"
        />
        <label htmlFor="stuart-query" className="sr-only">
          Ask Stuart a question
        </label>
        <input
          id="stuart-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={asked ? "Follow up…" : "Ask Stuart…"}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none focus-visible:outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          aria-label="Ask Stuart"
          disabled={!canSend}
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent transition-[filter] hover:brightness-95 disabled:bg-inset-2 disabled:text-muted"
        >
          <ArrowUp size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}
