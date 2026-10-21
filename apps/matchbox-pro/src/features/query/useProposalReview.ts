import { type WriteStep, useSequentialWrites } from "@/hooks/useWrites"
import { useNetwork } from "@/lib/network"
import { useViewer } from "@/lib/viewer"
import { describeWriteError } from "@/lib/writeErrors"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo, useRef, useState } from "react"
import { type Hex, getAddress, isHex } from "viem"
import { usePublicClient, useSendTransaction } from "wagmi"
import { describeStuartError, refreshProposal } from "./client"
import type {
  BallotEdit,
  Proposal,
  ProposalRefreshResponse as RefreshResponse,
} from "./contract"
import {
  type GuardResult,
  STUART_CHAIN_ID,
  dispatchGuard,
  dispatchOutcome,
  firstStoppedCall,
  initialCallStates,
  isExpired,
  pendingCalls,
  updateCall,
} from "./dispatch"
import type { CallState } from "./session"

export type ReviewPhase = "review" | "refreshing" | "diff" | "signing" | "done"

export type ReviewState = {
  turnId: string
  /** The proposal id the answer referenced; stable across refreshes. */
  sourceProposalId: string
  proposal: Proposal
  phase: ReviewPhase
  /** Drawer shown (the vote diff renders on the canvas instead). */
  drawerOpen: boolean
  refreshedAt: number | null
  refresh: RefreshResponse | null
  edits: BallotEdit[] | null
  /** Opened from "Edit allocation": the drawer starts in edit mode. */
  editRequested: boolean
  error: string | null
}

function hexData(value: string): Hex {
  if (!isHex(value)) throw new Error("Malformed call data.")
  return value
}

// A refresh this recent counts as "immediately before signing".
const FRESH_MS = 20_000

type Options = {
  dispatchFor: (proposalId: string) => CallState[] | undefined
  minedRequestKeys: readonly string[]
  saveDispatch: (proposalId: string, calls: CallState[]) => void
}

export function useProposalReview({
  dispatchFor,
  minedRequestKeys,
  saveDispatch,
}: Options) {
  const { viewer } = useViewer()
  const { chainId } = useNetwork()
  const writes = useSequentialWrites()
  const client = usePublicClient({ chainId: STUART_CHAIN_ID })
  const { sendTransactionAsync } = useSendTransaction()
  const queryClient = useQueryClient()
  const [state, setState] = useState<ReviewState | null>(null)
  /** Latest proposal per source id, so blocks show refreshed quotes. */
  const [latest, setLatest] = useState<Record<string, Proposal>>({})
  const callsRef = useRef<CallState[]>([])
  const failureKind = useRef(new Map<number, "rejected" | "other">())
  const abortRef = useRef<AbortController | null>(null)

  const guardFor = useCallback(
    (proposal: Proposal): GuardResult =>
      dispatchGuard({ viewer, appChainId: chainId, proposal }),
    [chainId, viewer],
  )

  const patch = useCallback((next: Partial<ReviewState>) => {
    setState((current) => (current ? { ...current, ...next } : current))
  }, [])

  const open = useCallback(
    (turnId: string, proposal: Proposal, options?: { edit?: boolean }) => {
      const current = latest[proposal.proposalId] ?? proposal
      setState({
        turnId,
        sourceProposalId: proposal.proposalId,
        proposal: current,
        phase: dispatchFor(current.proposalId) ? "done" : "review",
        drawerOpen: true,
        refreshedAt: null,
        refresh: null,
        edits: null,
        editRequested: options?.edit === true,
        error: null,
      })
    },
    [dispatchFor, latest],
  )

  const adopt = useCallback((sourceId: string, proposal: Proposal) => {
    setLatest((current) => ({ ...current, [sourceId]: proposal }))
  }, [])

  const doRefresh = useCallback(
    async (
      proposal: Proposal,
      options: {
        edits: BallotEdit[] | null
        manualOverride: boolean
        acceptNewOptimum?: boolean
        slippageBps?: number
      },
    ): Promise<RefreshResponse> => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      if (!viewer.address) throw new Error("No wallet")
      const edits =
        options.edits || options.slippageBps !== undefined
          ? {
              ...(options.edits ? { ballots: options.edits } : {}),
              ...(options.slippageBps !== undefined
                ? { slippageBps: options.slippageBps }
                : {}),
            }
          : undefined
      return refreshProposal(
        {
          version: 1,
          proposal,
          wallet: {
            address: viewer.address,
            mode: viewer.mode === "connected" ? "connected" : "watching",
          },
          ...(edits ? { edits } : {}),
          manualOverride: options.manualOverride,
          acceptNewOptimum: options.acceptNewOptimum ?? false,
        },
        controller.signal,
      )
    },
    [viewer],
  )

  const setCalls = useCallback(
    (proposalId: string, calls: CallState[]) => {
      callsRef.current = calls
      saveDispatch(proposalId, calls)
    },
    [saveDispatch],
  )

  const run = useCallback(
    async (proposal: Proposal) => {
      const toSend = pendingCalls(proposal, minedRequestKeys)
      const existing = dispatchFor(proposal.proposalId)
      const calls =
        existing && existing.length === proposal.calls.length
          ? existing
          : initialCallStates(proposal, minedRequestKeys)
      setCalls(proposal.proposalId, calls)
      patch({ phase: "signing", error: null })
      failureKind.current.clear()

      const steps: WriteStep[] = toSend.map((call) => ({
        id: `call-${call.index}`,
        call: { to: getAddress(call.to), data: hexData(call.data) },
        write: async () => {
          // A call that depends on an earlier one is simulated again once
          // that one has landed, before the wallet is asked (§3.7, R13).
          if (call.dependsOn !== null && client) {
            try {
              await client.call({
                account: getAddress(call.from),
                to: getAddress(call.to),
                data: hexData(call.data),
              })
            } catch {
              failureKind.current.set(call.index, "other")
              throw new Error("Simulation failed before signing. Nothing sent.")
            }
          }
          try {
            const hash = await sendTransactionAsync({
              to: getAddress(call.to),
              data: hexData(call.data),
              value: 0n,
              chainId: STUART_CHAIN_ID,
            })
            setCalls(
              proposal.proposalId,
              updateCall(callsRef.current, call.index, {
                status: "submitted",
                hash,
              }),
            )
            return hash
          } catch (error) {
            const kind = describeWriteError(error).kind
            failureKind.current.set(
              call.index,
              kind === "rejected" ? "rejected" : "other",
            )
            throw error
          }
        },
      }))

      await writes.run(steps, (id, status, error) => {
        const index = Number.parseInt(id.replace("call-", ""), 10)
        if (status === "signing") {
          setCalls(
            proposal.proposalId,
            updateCall(callsRef.current, index, {
              status: "awaiting_wallet",
              hash: null,
              error: null,
            }),
          )
          return
        }
        if (status === "done") {
          setCalls(
            proposal.proposalId,
            updateCall(callsRef.current, index, {
              status: "mined",
              error: null,
            }),
          )
          return
        }
        const sent = !!callsRef.current.find((call) => call.index === index)
          ?.hash
        const kind = failureKind.current.get(index)
        setCalls(
          proposal.proposalId,
          updateCall(callsRef.current, index, {
            status: sent
              ? "reverted"
              : kind === "rejected"
                ? "rejected"
                : "failed",
            error: error ?? null,
          }),
        )
      })
      patch({ phase: "done" })
      if (callsRef.current.some((call) => call.status === "mined")) {
        void queryClient.invalidateQueries()
      }
    },
    [
      client,
      dispatchFor,
      minedRequestKeys,
      patch,
      queryClient,
      sendTransactionAsync,
      setCalls,
      writes,
    ],
  )

  const sign = useCallback(async () => {
    if (!state || writes.busy) return
    const guard = guardFor(state.proposal)
    if (!guard.ok) return
    const fresh =
      state.refreshedAt !== null &&
      Date.now() - state.refreshedAt < FRESH_MS &&
      !isExpired(state.proposal, Date.now())
    if (fresh) {
      await run(state.proposal)
      return
    }
    patch({ phase: "refreshing", error: null })
    let refreshed: RefreshResponse
    try {
      refreshed = await doRefresh(state.proposal, {
        edits: state.edits,
        manualOverride: state.edits !== null,
      })
    } catch (error) {
      patch({ phase: "review", error: describeStuartError(error) })
      return
    }
    adopt(state.sourceProposalId, refreshed.proposal)
    if (refreshed.material) {
      // Vote diffs read as a canvas page (frame 38); others stay in the drawer.
      patch({
        phase: "diff",
        refresh: refreshed,
        refreshedAt: Date.now(),
        drawerOpen: refreshed.diff === null,
      })
      return
    }
    setState((current) =>
      current
        ? {
            ...current,
            proposal: refreshed.proposal,
            refresh: refreshed,
            refreshedAt: Date.now(),
          }
        : current,
    )
    if (!guardFor(refreshed.proposal).ok || !refreshed.proposal.canSign) {
      patch({ phase: "review", proposal: refreshed.proposal })
      return
    }
    await run(refreshed.proposal)
  }, [adopt, doRefresh, guardFor, patch, run, state, writes.busy])

  const acknowledge = useCallback(
    async (choice: "new_optimum" | "keep_mine") => {
      if (!state?.refresh) return
      const { refresh } = state
      if (choice === "new_optimum") {
        const next = refresh.recommended ?? refresh.proposal
        adopt(state.sourceProposalId, next)
        setState({
          ...state,
          proposal: next,
          phase: "review",
          drawerOpen: true,
          edits: null,
          refreshedAt: Date.now(),
          error: null,
        })
        return
      }
      if (refresh.preservedManualEdits) {
        setState({
          ...state,
          proposal: refresh.proposal,
          phase: "review",
          drawerOpen: true,
          refreshedAt: Date.now(),
          error: null,
        })
        return
      }
      patch({ phase: "refreshing", error: null })
      try {
        const kept = await doRefresh(state.proposal, {
          edits: state.edits,
          manualOverride: true,
        })
        adopt(state.sourceProposalId, kept.proposal)
        setState((current) =>
          current
            ? {
                ...current,
                proposal: kept.proposal,
                refresh: kept,
                phase: "review",
                drawerOpen: true,
                refreshedAt: Date.now(),
              }
            : current,
        )
      } catch (error) {
        patch({ phase: "diff", error: describeStuartError(error) })
      }
    },
    [adopt, doRefresh, patch, state],
  )

  /** Re-quote (zap slippage) or re-price without signing. */
  const requote = useCallback(
    async (
      turnId: string,
      proposal: Proposal,
      slippageBps?: number,
    ): Promise<string | null> => {
      try {
        const refreshed = await doRefresh(
          latest[proposal.proposalId] ?? proposal,
          {
            edits: null,
            manualOverride: false,
            ...(slippageBps !== undefined ? { slippageBps } : {}),
          },
        )
        adopt(proposal.proposalId, refreshed.proposal)
        setState((current) =>
          current && current.turnId === turnId
            ? {
                ...current,
                proposal: refreshed.proposal,
                refreshedAt: Date.now(),
              }
            : current,
        )
        return null
      } catch (error) {
        return describeStuartError(error)
      }
    },
    [adopt, doRefresh, latest],
  )

  const setEdits = useCallback(
    (edits: BallotEdit[] | null) => {
      patch({ edits, refreshedAt: null })
    },
    [patch],
  )

  const retry = useCallback(async () => {
    if (!state || writes.busy) return
    const calls = dispatchFor(state.proposal.proposalId) ?? []
    const stopped = firstStoppedCall(calls)
    if (!stopped) return
    if (isExpired(state.proposal, Date.now())) {
      // An expired quote is re-quoted; the user signs the fresh one.
      patch({ phase: "review", refreshedAt: null })
      return
    }
    await run(state.proposal)
  }, [dispatchFor, patch, run, state, writes.busy])

  const close = useCallback(() => {
    if (writes.busy) return
    abortRef.current?.abort()
    setState(null)
  }, [writes.busy])

  const cancelDiff = useCallback(() => {
    setState((current) =>
      current ? { ...current, phase: "review", drawerOpen: false } : current,
    )
  }, [])

  const calls = state ? (dispatchFor(state.proposal.proposalId) ?? []) : []

  return useMemo(
    () => ({
      state,
      calls,
      outcome: dispatchOutcome(calls),
      busy: writes.busy,
      batched: writes.batched,
      latest,
      guardFor,
      open,
      sign,
      acknowledge,
      requote,
      setEdits,
      retry,
      close,
      cancelDiff,
    }),
    [
      acknowledge,
      calls,
      cancelDiff,
      close,
      guardFor,
      latest,
      open,
      requote,
      retry,
      setEdits,
      sign,
      state,
      writes.batched,
      writes.busy,
    ],
  )
}

export type ProposalReview = ReturnType<typeof useProposalReview>
