import { describe, expect, it } from "vitest"
import {
  addedScopes,
  reviewHistory,
  reviewOutcomeLabel,
  scopeSummary,
  visibleReviewerNote,
} from "./reviews"

const base = {
  requestedScopes: ["gauge-profiles:read" as const],
  decidedAt: null,
  decidedBy: null,
}

describe("reviewHistory", () => {
  it("expands reviews into submission and decision events, newest first", () => {
    const events = reviewHistory([
      {
        ...base,
        id: "b",
        state: "changes-requested",
        decidedBy: "staff",
        requestedScopes: ["discord:profile"],
        createdAt: "2026-10-17T10:00:00Z",
        decidedAt: "2026-10-18T09:00:00Z",
      },
      {
        ...base,
        id: "a",
        state: "approved",
        decidedBy: "auto",
        requestedScopes: ["gauge-profiles:read", "openid", "wallet"],
        createdAt: "2026-09-30T08:00:00Z",
        decidedAt: "2026-09-30T08:00:00Z",
      },
    ])
    expect(events.map((event) => [event.label, event.scopes])).toEqual([
      ["Changes requested", "discord:profile"],
      ["Submitted", "discord:profile"],
      ["Auto-approved", "gauge-profiles:read +2"],
    ])
  })

  it("lists open reviews as a single submission", () => {
    const events = reviewHistory([
      { ...base, id: "c", state: "open", createdAt: "2026-10-19T00:00:00Z" },
    ])
    expect(events).toHaveLength(1)
    expect(events[0]?.tone).toBe("neutral")
  })
})

describe("review helpers", () => {
  it("labels outcomes for developers", () => {
    expect(reviewOutcomeLabel({ state: "approved", decidedBy: "auto" })).toBe(
      "Auto-approved",
    )
    expect(reviewOutcomeLabel({ state: "approved", decidedBy: "staff" })).toBe(
      "Approved",
    )
    expect(
      reviewOutcomeLabel({ state: "withdrawn", decidedBy: "developer" }),
    ).toBe("Withdrawn")
  })

  it("shows only staff notes", () => {
    expect(
      visibleReviewerNote({ reviewerNote: "Auto-approved", decidedBy: "auto" }),
    ).toBeNull()
    expect(
      visibleReviewerNote({ reviewerNote: "  Add a URL ", decidedBy: "staff" }),
    ).toBe("Add a URL")
    expect(
      visibleReviewerNote({ reviewerNote: " ", decidedBy: "staff" }),
    ).toBeNull()
  })

  it("summarises scopes and finds added ones", () => {
    expect(scopeSummary([])).toBe("—")
    expect(scopeSummary(["openid", "wallet"])).toBe("openid +1")
    expect(addedScopes(["openid", "discord:id"], ["openid"])).toEqual([
      "discord:id",
    ])
    expect(addedScopes(["openid"], ["openid"])).toEqual(["openid"])
  })
})
