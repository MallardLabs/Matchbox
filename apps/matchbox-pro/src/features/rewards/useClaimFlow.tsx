import { useRewardClaims } from "@/hooks/useRewardClaims"
import { type ReactElement, useCallback, useState } from "react"
import ClaimSheet from "./ClaimSheet"
import type { ClaimSource } from "./claimSources"
import { useClaimRun } from "./useClaimRun"

export type ClaimFlow = {
  /** Opens the claim sheet and asks for the first signature. */
  start: (sources: ClaimSource[]) => void
  /** A run is signing or confirming; `reopen` brings the sheet back. */
  running: boolean
  /** A claim from an earlier run (or another tab) is still confirming. */
  confirming: boolean
  reopen: () => void
  /** Render this once on the page. */
  sheet: ReactElement | null
}

/**
 * "Claim all" for any page: one signature per source, signed in order, in the
 * J03 claim sheet. `onDone` runs when a finished run's sheet closes.
 */
export function useClaimFlow(onDone?: () => void): ClaimFlow {
  const run = useClaimRun()
  const receipts = useRewardClaims()
  const [open, setOpen] = useState(false)
  const { start: startRun, close } = run

  const start = useCallback(
    (sources: ClaimSource[]) => {
      if (sources.length === 0) return
      startRun(sources)
      setOpen(true)
    },
    [startRun],
  )

  const sheet =
    run.run && run.phase ? (
      <ClaimSheet
        open={open}
        sources={run.run.sources}
        steps={run.run.steps}
        phase={run.phase}
        explorer={receipts.explorer}
        onRetry={run.retry}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next && run.phase !== "running") {
            close()
            onDone?.()
          }
        }}
      />
    ) : null

  return {
    start,
    running: run.phase === "running",
    confirming: receipts.pending,
    reopen: () => setOpen(true),
    sheet,
  }
}
