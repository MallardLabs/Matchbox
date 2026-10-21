import { useNetwork } from "@/lib/network"
import { useViewer } from "@/lib/viewer"
import { useRouterState } from "@tanstack/react-router"
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useAccount } from "wagmi"
import ProposalDrawer from "./ProposalDrawer"
import {
  StuartClientError,
  askStuart,
  describeStuartError,
  isAbortError,
} from "./client"
import {
  type ClarificationCardId,
  MEZO_MAINNET_CHAIN_ID,
  MEZO_TESTNET_CHAIN_ID,
  type StuartRequest,
} from "./contract"
import {
  type CallState,
  SESSION_STORAGE_KEY,
  type StuartSession,
  type StuartTurn,
  type Surface,
  activeTurn,
  appendTurn,
  carryPendingTurns,
  createSession,
  failTurn,
  latestAnswered,
  parseSession,
  previousAnswered,
  resolveTurn,
  serializeSession,
  setActiveTurn,
  setDispatch,
  setReport,
  walletKeyFor,
} from "./session"
import { type ProposalReview, useProposalReview } from "./useProposalReview"

export type AskOptions = {
  surface: Surface
  /** Answering a clarification card: the server resolves it without re-asking. */
  clarification?: { cardId: ClarificationCardId; optionId: string }
  /** Send the previous answer as follow-up context (default: true). */
  followUp?: boolean
}

type StuartContextValue = {
  session: StuartSession
  active: StuartTurn | null
  latest: StuartTurn | null
  /** The wallet has settled (not reconnecting), so the session key is final. */
  ready: boolean
  ask: (query: string, options: AskOptions) => string | null
  retryTurn: (turnId: string) => void
  selectTurn: (turnId: string) => void
  markReport: (draftId: string, value: string) => void
  rail: {
    visible: boolean
    mounted: boolean
    show: () => void
    dismiss: () => void
    register: () => () => void
  }
  review: ProposalReview
}

const StuartContext = createContext<StuartContextValue | null>(null)

export function useStuart(): StuartContextValue {
  const value = useContext(StuartContext)
  if (!value) throw new Error("useStuart must be used inside <StuartProvider>")
  return value
}

function newId(): string {
  return crypto.randomUUID()
}

function loadSession(walletKey: string): StuartSession {
  try {
    const stored = parseSession(
      window.sessionStorage.getItem(SESSION_STORAGE_KEY),
      walletKey,
    )
    if (stored) return stored
  } catch {
    // Storage blocked: the session lives in memory for this page view.
  }
  return createSession(walletKey, newId())
}

/**
 * Tab-session Stuart thread, shared by the palette, the docked workspace and
 * the /query canvas. Resets when the wallet or network changes so one
 * wallet's answers never show for another.
 */
export function StuartProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const { viewer } = useViewer()
  const { chainId } = useNetwork()
  const { status } = useAccount()
  const ready = status !== "reconnecting" && status !== "connecting"
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const walletKey = walletKeyFor(chainId, viewer.address)
  const [stored, setSession] = useState<StuartSession>(() =>
    loadSession(walletKey),
  )
  const [railHidden, setRailHidden] = useState(false)
  const [railMounts, setRailMounts] = useState(0)
  const sequence = useRef(0)
  const controllers = useRef(new Map<string, AbortController>())
  const carried = useRef(new Map<string, StuartTurn>())

  // Switch sessions during render, so no child ever asks into the previous
  // wallet's session; unanswered questions move over and are asked again.
  let session = stored
  if (stored.walletKey !== walletKey) {
    const next = carryPendingTurns(stored, loadSession(walletKey))
    session = next.session
    for (const turn of next.carried) carried.current.set(turn.id, turn)
    // Answers still in flight belong to the previous wallet: drop them.
    sequence.current += 1
    setSession(session)
  }
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        serializeSession(session),
      )
    } catch {
      // Storage full or blocked; the thread still works for this page view.
    }
  }, [session])

  // Testnet questions are answered "unsupported" by the runtime, not refused.
  const requestChainId =
    chainId === MEZO_TESTNET_CHAIN_ID
      ? MEZO_TESTNET_CHAIN_ID
      : MEZO_MAINNET_CHAIN_ID

  const send = useCallback(
    (turn: StuartTurn, options: AskOptions) => {
      const current = sessionRef.current
      const previous =
        options.followUp === false
          ? null
          : previousAnswered(current, turn.id)?.response
      const request: StuartRequest = {
        version: 1,
        query: turn.query,
        sessionId: current.sessionId,
        turn: Math.min(
          200,
          current.turns.findIndex((item) => item.id === turn.id),
        ),
        surface: turn.surface,
        chainId: requestChainId,
        ...(viewer.address
          ? {
              wallet: {
                address: viewer.address,
                mode: viewer.mode === "connected" ? "connected" : "watching",
              },
            }
          : {}),
        context: {
          page: { route: pathname.slice(0, 120) },
          ...(previous
            ? {
                previous: {
                  responseId: previous.responseId,
                  intent: previous.intent,
                },
              }
            : {}),
          ...(options.clarification
            ? { clarification: options.clarification }
            : {}),
        },
      }
      // A newer question supersedes any answer still in flight.
      for (const [id, controller] of controllers.current) {
        if (id !== turn.id) {
          controller.abort()
          setSession((state) =>
            failTurn(state, id, {
              code: "interrupted",
              message: "Replaced by a newer question.",
            }),
          )
        }
      }
      controllers.current.clear()
      const controller = new AbortController()
      controllers.current.set(turn.id, controller)
      const ticket = ++sequence.current
      askStuart(request, controller.signal)
        .then((response) => {
          if (ticket !== sequence.current) return
          setSession((state) => resolveTurn(state, turn.id, response))
        })
        .catch((error: unknown) => {
          if (isAbortError(error) || ticket !== sequence.current) return
          setSession((state) =>
            failTurn(state, turn.id, {
              code:
                error instanceof StuartClientError ? error.code : "unavailable",
              message: describeStuartError(error),
            }),
          )
        })
        .finally(() => {
          if (controllers.current.get(turn.id) === controller) {
            controllers.current.delete(turn.id)
          }
        })
    },
    [pathname, requestChainId, viewer],
  )

  useEffect(() => {
    if (carried.current.size === 0) return
    const turns = [...carried.current.values()]
    carried.current.clear()
    for (const controller of controllers.current.values()) controller.abort()
    controllers.current.clear()
    for (const turn of turns) {
      send(turn, {
        surface: turn.surface,
        followUp: false,
        ...(turn.clarification ? { clarification: turn.clarification } : {}),
      })
    }
  }, [send])

  const ask = useCallback(
    (query: string, options: AskOptions): string | null => {
      const text = query.trim().slice(0, 2_000)
      if (text.length === 0) return null
      const turn: StuartTurn = {
        id: newId(),
        query: text,
        surface: options.surface,
        askedAt: Date.now(),
        status: "pending",
        response: null,
        error: null,
        clarification: options.clarification ?? null,
      }
      const next = appendTurn(sessionRef.current, turn)
      sessionRef.current = next
      setSession(next)
      setRailHidden(false)
      send(turn, options)
      return turn.id
    },
    [send],
  )

  const retryTurn = useCallback(
    (turnId: string) => {
      const turn = sessionRef.current.turns.find((item) => item.id === turnId)
      if (!turn) return
      ask(turn.query, {
        surface: turn.surface,
        ...(turn.clarification ? { clarification: turn.clarification } : {}),
      })
    },
    [ask],
  )

  const selectTurn = useCallback((turnId: string) => {
    setSession((state) => setActiveTurn(state, turnId))
  }, [])

  const markReport = useCallback((draftId: string, value: string) => {
    setSession((state) => setReport(state, draftId, value))
  }, [])

  const saveDispatch = useCallback((proposalId: string, calls: CallState[]) => {
    setSession((state) => setDispatch(state, proposalId, calls))
  }, [])
  const dispatchFor = useCallback(
    (proposalId: string) => sessionRef.current.dispatch[proposalId],
    [],
  )

  const review = useProposalReview({
    dispatchFor,
    minedRequestKeys: session.minedRequestKeys,
    saveDispatch,
  })

  const register = useCallback(() => {
    setRailMounts((count) => count + 1)
    return () => setRailMounts((count) => count - 1)
  }, [])

  const value = useMemo<StuartContextValue>(
    () => ({
      session,
      active: activeTurn(session),
      latest: latestAnswered(session),
      ready,
      ask,
      retryTurn,
      selectTurn,
      markReport,
      rail: {
        visible: !railHidden,
        mounted: railMounts > 0,
        show: () => setRailHidden(false),
        dismiss: () => setRailHidden(true),
        register,
      },
      review,
    }),
    [
      ask,
      markReport,
      railHidden,
      ready,
      railMounts,
      register,
      retryTurn,
      review,
      selectTurn,
      session,
    ],
  )

  return (
    <StuartContext.Provider value={value}>
      {children}
      <ProposalDrawer />
    </StuartContext.Provider>
  )
}
