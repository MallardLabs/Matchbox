import { describe, expect, it } from "vitest"
import { stuartResponseSchema } from "./contract"
import { responseFixture } from "./fixtures"
import {
  type StuartTurn,
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
  setDispatch,
  walletKeyFor,
} from "./session"

const KEY = walletKeyFor(31_612, "0xABC")

function turn(
  id: string,
  query = "What should I vote this epoch?",
): StuartTurn {
  return {
    id,
    query,
    surface: "palette",
    askedAt: 1,
    status: "pending",
    response: null,
    error: null,
    clarification: null,
  }
}

describe("stuart session", () => {
  it("fixture responses satisfy the response schema", () => {
    expect(stuartResponseSchema.safeParse(responseFixture()).success).toBe(true)
  })

  it("appends, resolves and tracks the active and latest answered turn", () => {
    let session = createSession(KEY, "s1")
    session = appendTurn(session, turn("a"))
    session = resolveTurn(session, "a", responseFixture())
    session = appendTurn(session, turn("b", "follow up"))
    expect(activeTurn(session)?.id).toBe("b")
    expect(latestAnswered(session)?.id).toBe("a")
    expect(previousAnswered(session, "b")?.id).toBe("a")
    session = failTurn(session, "b", { code: "network", message: "x" })
    expect(activeTurn(session)?.status).toBe("error")
  })

  it("keys sessions by chain and lowercase address", () => {
    expect(walletKeyFor(31_612, "0xABC")).toBe("31612:0xabc")
    expect(walletKeyFor(31_611, undefined)).toBe("31611:-")
  })

  it("round-trips storage and drops another wallet's session", () => {
    let session = appendTurn(createSession(KEY, "s1"), turn("a"))
    session = resolveTurn(session, "a", responseFixture())
    const text = serializeSession(session)
    expect(parseSession(text, KEY)?.turns[0]?.response?.title).toBe(
      "Best return for my veMEZO this epoch",
    )
    expect(parseSession(text, walletKeyFor(31_612, "0xdef"))).toBeNull()
    expect(parseSession("{not json", KEY)).toBeNull()
    expect(parseSession(null, KEY)).toBeNull()
  })

  it("marks a turn interrupted by a reload and settles in-flight calls", () => {
    let session = appendTurn(createSession(KEY, "s1"), turn("a"))
    session = setDispatch(session, "p1", [
      {
        index: 0,
        requestKey: "k0",
        label: "Approve",
        status: "mined",
        hash: "0x1",
        error: null,
      },
      {
        index: 1,
        requestKey: "k1",
        label: "Swap",
        status: "submitted",
        hash: "0x2",
        error: null,
      },
      {
        index: 2,
        requestKey: "k2",
        label: "Deposit",
        status: "awaiting_wallet",
        hash: null,
        error: null,
      },
    ])
    const restored = parseSession(serializeSession(session), KEY)
    expect(restored?.turns[0]?.status).toBe("error")
    expect(restored?.turns[0]?.error?.code).toBe("interrupted")
    expect(restored?.dispatch.p1?.map((call) => call.status)).toEqual([
      "mined",
      "failed",
      "rejected",
    ])
    expect(restored?.minedRequestKeys).toEqual(["k0"])
  })

  it("evicts the oldest turns to stay under the byte cap", () => {
    let session = createSession(KEY, "s1")
    for (const id of ["a", "b", "c"]) {
      session = appendTurn(session, turn(id))
      session = resolveTurn(session, id, responseFixture())
    }
    const full = serializeSession(session, Number.MAX_SAFE_INTEGER)
    const capped = serializeSession(session, Math.ceil(full.length / 2))
    const restored = parseSession(capped, KEY)
    expect(restored?.turns.map((item) => item.id)).toEqual(["c"])
    expect(restored?.activeTurnId).toBe("c")
  })

  it("carries unanswered questions to the next wallet, not answers", () => {
    let previous = appendTurn(createSession(KEY, "s1"), turn("a"))
    previous = resolveTurn(previous, "a", responseFixture())
    previous = appendTurn(previous, turn("b", "asked while reconnecting"))
    const next = createSession(walletKeyFor(31_612, "0xdef"), "s2")
    const { session, carried } = carryPendingTurns(previous, next)
    expect(carried.map((item) => item.id)).toEqual(["b"])
    expect(session.turns.map((item) => item.id)).toEqual(["b"])
    expect(session.activeTurnId).toBe("b")
    expect(session.walletKey).toBe("31612:0xdef")
  })
})
