import { useBoostGauges } from "@/hooks/useBoostGauges"
import { profileForGauge, useGaugeProfiles } from "@/hooks/useProfiles"
import { useViewer } from "@/lib/viewer"
import { Link, useNavigate } from "@tanstack/react-router"
import { type ReactElement, useEffect, useMemo, useRef } from "react"
import { type AskOptions, useStuart } from "./StuartProvider"
import TurnCanvas, { viewerSummary } from "./TurnCanvas"
import { suggestedQuestions } from "./suggestions"

type QueryPageProps = {
  /** `/query?q=` starts a new question. */
  q: string | undefined
  /** `/query?r=` reopens a turn from this tab's session. */
  r: string | undefined
}

/** `/query`: the full Stuart canvas (frames 32, 36–41, 38; M04, T04). */
export default function QueryPage({ q, r }: QueryPageProps): ReactElement {
  const { session, active, ask, selectTurn, ready } = useStuart()
  const { viewer } = useViewer()
  const navigate = useNavigate()
  const handled = useRef<string | null>(null)
  const viewerLabel = viewerSummary(viewer.mode, viewer.address)

  useEffect(() => {
    if (!q || !ready || handled.current === q) return
    handled.current = q
    const id = ask(q, { surface: "canvas", followUp: false })
    if (id) {
      void navigate({
        to: "/query",
        search: (prev) => ({ ...prev, q: undefined, r: id }),
        replace: true,
      })
    }
  }, [ask, navigate, q, ready])

  useEffect(() => {
    if (r) selectTurn(r)
  }, [r, selectTurn])

  function onAsk(text: string, options?: Partial<AskOptions>): void {
    const id = ask(text, { surface: "composer", ...options })
    if (id) {
      void navigate({
        to: "/query",
        search: (prev) => ({ ...prev, q: undefined, r: id }),
      })
    }
  }

  const earlier = session.turns
    .filter((turn) => turn.id !== active?.id && turn.status !== "pending")
    .slice(-5)
    .reverse()

  return (
    <div className="flex flex-col gap-8">
      <TurnCanvas
        turn={q && handled.current !== q ? null : active}
        viewerLabel={viewerLabel}
        onAsk={onAsk}
      />
      {!active && !q ? <Suggestions onAsk={onAsk} /> : null}
      {earlier.length > 0 ? (
        <nav
          aria-label="Earlier in this session"
          className="flex flex-col gap-1.5"
        >
          <h2 className="m-0 text-caption text-muted">Earlier</h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {earlier.map((turn) => (
              <li key={turn.id}>
                <Link
                  to="/query"
                  search={{ r: turn.id }}
                  className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-body-sm text-ink hover:text-accent-ink"
                >
                  <span className="truncate">{turn.query}</span>
                  {turn.status === "error" ? (
                    <span className="shrink-0 text-label text-neg">
                      No answer
                    </span>
                  ) : turn.response ? (
                    <span className="hidden min-w-0 shrink truncate text-label text-muted sm:block">
                      {turn.response.title}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  )
}

function Suggestions({
  onAsk,
}: {
  onAsk: (text: string, options?: Partial<AskOptions>) => void
}): ReactElement {
  const { viewer } = useViewer()
  const { gauges } = useBoostGauges()
  const { data: profiles } = useGaugeProfiles()
  const topGauge = useMemo(() => {
    for (const gauge of gauges) {
      const name = profileForGauge(profiles, gauge.address)?.display_name
      if (name) return name
    }
    return null
  }, [gauges, profiles])
  const questions = suggestedQuestions({ viewer, topGauge })
  return (
    <ul
      aria-label="Suggested questions"
      className="m-0 flex list-none flex-wrap gap-2 p-0"
    >
      {questions.map((question) => (
        <li key={question}>
          <button
            type="button"
            onClick={() => onAsk(question, { surface: "canvas" })}
            className="inline-flex h-8 items-center rounded-md bg-inset px-3 text-body-sm text-ink-2 transition-colors hover:text-ink"
          >
            {question}
          </button>
        </li>
      ))}
    </ul>
  )
}
