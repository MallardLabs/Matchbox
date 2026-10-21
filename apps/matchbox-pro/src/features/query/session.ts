import { z } from "zod"
import type { StuartErrorCode } from "./client"
import {
  type ClarificationCardId,
  type StuartResponse,
  clarificationCardIdSchema,
  stuartResponseSchema,
} from "./contract"

// Tab-session thread store (handoff: no server threads in v1). Pure so the
// provider stays thin and the eviction and reset rules are testable.

export const SESSION_STORAGE_KEY = "matchbox-pro:stuart:v1"
export const SESSION_BYTE_CAP = 256 * 1024
export const MAX_TURNS = 200

export type Surface = "palette" | "rail" | "canvas" | "composer"

export type TurnError = {
  code: StuartErrorCode | "interrupted"
  message: string
}

export type StuartTurn = {
  id: string
  query: string
  surface: Surface
  askedAt: number
  status: "pending" | "done" | "error"
  response: StuartResponse | null
  error: TurnError | null
  clarification: { cardId: ClarificationCardId; optionId: string } | null
}

export type CallStatus =
  | "not_sent"
  | "awaiting_wallet"
  | "submitted"
  | "mined"
  | "reverted"
  | "rejected"
  | "failed"

export type CallState = {
  index: number
  requestKey: string
  label: string
  status: CallStatus
  hash: string | null
  error: string | null
}

export type StuartSession = {
  version: 1
  sessionId: string
  walletKey: string
  turns: StuartTurn[]
  activeTurnId: string | null
  /** Per proposal id: the wallet's dispatch state. Client state only. */
  dispatch: Record<string, CallState[]>
  /** Calls the wallet already landed; never sent again (frame 45). */
  minedRequestKeys: string[]
  /** Support report drafts: the reference once sent, or "dismissed". */
  reports: Record<string, string>
}

export function walletKeyFor(
  chainId: number,
  address: string | undefined,
): string {
  return `${chainId}:${address ? address.toLowerCase() : "-"}`
}

export function createSession(
  walletKey: string,
  sessionId: string,
): StuartSession {
  return {
    version: 1,
    sessionId,
    walletKey,
    turns: [],
    activeTurnId: null,
    dispatch: {},
    minedRequestKeys: [],
    reports: {},
  }
}

export function appendTurn(
  session: StuartSession,
  turn: StuartTurn,
): StuartSession {
  const turns = [...session.turns, turn].slice(-MAX_TURNS)
  return { ...session, turns, activeTurnId: turn.id }
}

function patchTurn(
  session: StuartSession,
  id: string,
  patch: Partial<StuartTurn>,
): StuartSession {
  return {
    ...session,
    turns: session.turns.map((turn) =>
      turn.id === id ? { ...turn, ...patch } : turn,
    ),
  }
}

/**
 * Moves to another wallet's session. Answered turns stay behind; questions
 * still waiting are carried over so they can be asked again for this wallet
 * (a wallet that reconnects right after load must not drop `/query?q=`).
 */
export function carryPendingTurns(
  previous: StuartSession,
  next: StuartSession,
): { session: StuartSession; carried: StuartTurn[] } {
  const carried = previous.turns.filter(
    (turn) =>
      turn.status === "pending" &&
      !next.turns.some((existing) => existing.id === turn.id),
  )
  let session = next
  for (const turn of carried) session = appendTurn(session, turn)
  return { session, carried }
}

export function resolveTurn(
  session: StuartSession,
  id: string,
  response: StuartResponse,
): StuartSession {
  return patchTurn(session, id, {
    status: "done",
    response,
    error: null,
  })
}

export function failTurn(
  session: StuartSession,
  id: string,
  error: TurnError,
): StuartSession {
  return patchTurn(session, id, { status: "error", error })
}

export function setActiveTurn(
  session: StuartSession,
  id: string,
): StuartSession {
  if (!session.turns.some((turn) => turn.id === id)) return session
  return { ...session, activeTurnId: id }
}

export function activeTurn(session: StuartSession): StuartTurn | null {
  const active = session.turns.find((turn) => turn.id === session.activeTurnId)
  return active ?? session.turns.at(-1) ?? null
}

/** The latest turn that finished with an answer (the rail shows it). */
export function latestAnswered(session: StuartSession): StuartTurn | null {
  for (let index = session.turns.length - 1; index >= 0; index -= 1) {
    const turn = session.turns[index]
    if (turn?.status === "done" && turn.response) return turn
  }
  return null
}

/** Previous answered turn before `id`, for follow-up context. */
export function previousAnswered(
  session: StuartSession,
  beforeId?: string,
): StuartTurn | null {
  const end = beforeId
    ? session.turns.findIndex((turn) => turn.id === beforeId)
    : session.turns.length
  for (
    let index = (end < 0 ? session.turns.length : end) - 1;
    index >= 0;
    index -= 1
  ) {
    const turn = session.turns[index]
    if (turn?.status === "done" && turn.response) return turn
  }
  return null
}

export function setDispatch(
  session: StuartSession,
  proposalId: string,
  calls: CallState[],
): StuartSession {
  const mined = calls
    .filter((call) => call.status === "mined")
    .map((call) => call.requestKey)
  const minedRequestKeys = [...new Set([...session.minedRequestKeys, ...mined])]
  return {
    ...session,
    dispatch: { ...session.dispatch, [proposalId]: calls },
    minedRequestKeys,
  }
}

export function setReport(
  session: StuartSession,
  draftId: string,
  value: string,
): StuartSession {
  return { ...session, reports: { ...session.reports, [draftId]: value } }
}

const callStateSchema = z.object({
  index: z.number().int().min(0),
  requestKey: z.string(),
  label: z.string(),
  status: z.enum([
    "not_sent",
    "awaiting_wallet",
    "submitted",
    "mined",
    "reverted",
    "rejected",
    "failed",
  ]),
  hash: z.string().nullable(),
  error: z.string().nullable(),
})

const turnSchema = z.object({
  id: z.string(),
  query: z.string(),
  surface: z.enum(["palette", "rail", "canvas", "composer"]),
  askedAt: z.number(),
  status: z.enum(["pending", "done", "error"]),
  response: stuartResponseSchema.nullable(),
  error: z
    .object({
      code: z.enum([
        "invalid_request",
        "rate_limited",
        "forbidden",
        "too_large",
        "unavailable",
        "network",
        "bad_response",
        "proposal_expired",
        "wallet_mismatch",
        "support_unavailable",
        "interrupted",
      ]),
      message: z.string(),
    })
    .nullable(),
  clarification: z
    .object({ cardId: clarificationCardIdSchema, optionId: z.string() })
    .nullable(),
})

const sessionSchema = z.object({
  version: z.literal(1),
  sessionId: z.string(),
  walletKey: z.string(),
  turns: z.array(turnSchema),
  activeTurnId: z.string().nullable(),
  dispatch: z.record(z.string(), z.array(callStateSchema)),
  minedRequestKeys: z.array(z.string()),
  reports: z.record(z.string(), z.string()).default({}),
})

const INTERRUPTED: TurnError = {
  code: "interrupted",
  message: "Interrupted by a reload. Ask again.",
}

// A wallet call that was mid-flight when the tab reloaded has an unknown
// outcome; it is shown as failed with its hash so the user can check it.
function settleCall(call: CallState): CallState {
  if (call.status === "awaiting_wallet") {
    return { ...call, status: "rejected", error: "Not sent." }
  }
  if (call.status === "submitted") {
    return { ...call, status: "failed", error: "Outcome unknown after reload." }
  }
  return call
}

/** Restores a stored session for this wallet, or null. Never throws. */
export function parseSession(
  raw: string | null,
  walletKey: string,
): StuartSession | null {
  if (!raw) return null
  try {
    const parsed = sessionSchema.safeParse(JSON.parse(raw))
    if (!parsed.success || parsed.data.walletKey !== walletKey) return null
    const data = parsed.data
    return {
      ...data,
      turns: data.turns.map((turn) => ({
        ...turn,
        ...(turn.status === "pending"
          ? { status: "error" as const, error: INTERRUPTED }
          : {}),
      })),
      dispatch: Object.fromEntries(
        Object.entries(data.dispatch).map(([key, calls]) => [
          key,
          calls.map(settleCall),
        ]),
      ),
    }
  } catch {
    return null
  }
}

/** JSON under the byte cap; drops the oldest turns first. */
export function serializeSession(
  session: StuartSession,
  cap: number = SESSION_BYTE_CAP,
): string {
  let current = session
  let text = JSON.stringify(current)
  while (text.length > cap && current.turns.length > 1) {
    const [, ...rest] = current.turns
    const keep = new Set(
      rest.flatMap(
        (turn) =>
          turn.response?.proposedActions.map((action) => action.proposalId) ??
          [],
      ),
    )
    current = {
      ...current,
      turns: rest,
      activeTurnId: rest.some((turn) => turn.id === current.activeTurnId)
        ? current.activeTurnId
        : (rest.at(-1)?.id ?? null),
      dispatch: Object.fromEntries(
        Object.entries(current.dispatch).filter(([key]) => keep.has(key)),
      ),
    }
    text = JSON.stringify(current)
  }
  return text
}
