import { useMediaQuery } from "@/hooks/useMediaQuery"
import { cn } from "@repo/ui/cn"
import * as Dialog from "@repo/ui/dialog"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { LoaderCircle, Sparkles, X } from "lucide-react"
import { type ReactElement, useEffect, useState } from "react"
import { useStuart } from "./StuartProvider"
import { Composer, SourceChips } from "./parts"
import type { StuartTurn } from "./session"

/**
 * Frame 33: Stuart's latest answer docked beside any page, surviving
 * navigation to Vote or Rewards. From 1680px it is a 360px column (pages
 * keep ~944px); narrower, a pill opens the same answer in a drawer so pages
 * keep their width. Hidden on /query (the canvas).
 *
 * Mount once in the shell, as a sibling of <AppShell.Main> inside a flex row.
 */
const DOCK_QUERY = "(min-width: 1680px)"

export default function StuartWorkspace(): ReactElement | null {
  const { session, latest, rail } = useStuart()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const desktop = useMediaQuery(DOCK_QUERY)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { register } = rail

  useEffect(() => register(), [register])

  const newest = session.turns.at(-1) ?? null
  const turn: StuartTurn | null =
    newest && newest.status === "pending" ? newest : (latest ?? newest)
  if (!turn || !rail.visible || pathname === "/query") return null

  if (desktop) {
    return (
      <aside
        aria-label="Stuart"
        className="sticky top-[72px] hidden max-h-[calc(100dvh-72px)] w-[392px] shrink-0 self-start overflow-y-auto py-7 pr-8 min-[1680px]:block"
      >
        <RailCard turn={turn} onDismiss={rail.dismiss} />
      </aside>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-[76px] right-4 z-sticky flex h-10 max-w-[calc(100vw-32px)] items-center gap-2 rounded-full border border-line bg-surface pl-3 pr-4 text-body-sm font-600 text-ink shadow-pop md:bottom-6"
      >
        {turn.status === "pending" ? (
          <LoaderCircle
            aria-hidden="true"
            size={15}
            strokeWidth={2}
            className="animate-spin text-muted motion-reduce:animate-none"
          />
        ) : (
          <Sparkles
            aria-hidden="true"
            size={15}
            strokeWidth={1.75}
            className="text-accent"
          />
        )}
        <span className="truncate">Stuart</span>
      </button>
      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Content placement="drawer" aria-describedby={undefined}>
          <Dialog.Header>
            <Dialog.Title className="font-600">Stuart</Dialog.Title>
          </Dialog.Header>
          <RailBody turn={turn} onNavigate={() => setDrawerOpen(false)} />
        </Dialog.Content>
      </Dialog.Root>
    </>
  )
}

function RailCard({
  turn,
  onDismiss,
}: {
  turn: StuartTurn
  onDismiss: () => void
}): ReactElement {
  return (
    <section
      aria-label="Stuart answer"
      className="relative flex min-h-[320px] flex-col gap-3 rounded-lg border border-line bg-surface p-4"
    >
      <div className="flex items-center justify-between">
        <p className="m-0 text-caption text-muted">Stuart</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close Stuart"
          className="-mr-1.5 -mt-1.5 flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-inset hover:text-ink"
        >
          <X aria-hidden="true" size={14} strokeWidth={1.75} />
        </button>
      </div>
      <RailBody turn={turn} />
    </section>
  )
}

function RailBody({
  turn,
  onNavigate,
}: {
  turn: StuartTurn
  onNavigate?: () => void
}): ReactElement {
  const { ask, retryTurn } = useStuart()
  const navigate = useNavigate()
  const response = turn.response

  function openCanvas(): void {
    onNavigate?.()
    void navigate({ to: "/query", search: { r: turn.id } })
  }

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <p className="m-0 text-body-sm text-secondary">{turn.query}</p>
      {turn.status === "pending" ? (
        <p className="m-0 flex items-center gap-2 text-label text-secondary">
          <LoaderCircle
            aria-hidden="true"
            size={13}
            strokeWidth={2}
            className="animate-spin text-muted motion-reduce:animate-none"
          />
          Running Matchbox tools
        </p>
      ) : turn.status === "error" || !response ? (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="m-0 text-label text-neg">
            {turn.error?.message ?? "No answer."}
          </p>
          <button
            type="button"
            onClick={() => retryTurn(turn.id)}
            className="text-label font-600 text-ink hover:underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <p className="m-0 text-body font-500 text-ink">
            {response.answer.text}
          </p>
          {response.why && response.why.items.length > 0 ? (
            <p className="m-0 text-label text-secondary">
              <span className="pr-1.5 text-ink-2">Why?</span>
              {response.why.items.map((item) => item.text).join(" ")}
            </p>
          ) : null}
          <SourceChips evidence={response.evidence} compact />
        </>
      )}
      <div>
        <button
          type="button"
          onClick={openCanvas}
          className={cn(
            "inline-flex h-8 items-center rounded-md bg-accent px-3 text-label font-600 text-on-accent transition-[filter] hover:brightness-95",
          )}
        >
          Open full canvas
        </button>
      </div>
      <Composer
        size="rail"
        label="Ask Stuart a follow-up"
        placeholder="Follow up…"
        onSubmit={(text) => ask(text, { surface: "rail" })}
      />
    </div>
  )
}
