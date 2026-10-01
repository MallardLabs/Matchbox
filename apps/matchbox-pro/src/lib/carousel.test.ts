import { describe, expect, it } from "vitest"
import {
  createCarousel,
  hasQueuedAfter,
  isAllDone,
  markConfirmed,
  markFailed,
  retryItem,
} from "./carousel"

describe("signing carousel", () => {
  it("starts the first row as signing and later rows queued", () => {
    const state = createCarousel([
      { id: "1", label: "Vote with veMEZO #4821" },
      { id: "2", label: "Vote with veMEZO #4966" },
    ])
    expect(state.items[0]?.status).toBe("signing")
    expect(state.items[1]?.status).toBe("queued")
  })

  it("promotes the next queued row when the current one confirms", () => {
    const started = createCarousel([
      { id: "1", label: "Claim veBTC gauges" },
      { id: "2", label: "Claim pools" },
      { id: "3", label: "Claim validators" },
    ])
    const next = markConfirmed(started, "1")
    expect(next.items.map((item) => item.status)).toEqual([
      "done",
      "signing",
      "queued",
    ])
    expect(hasQueuedAfter(next)).toBe(true)
  })

  it("leaves no queued row and no next prompt when every step is done", () => {
    let state = createCarousel([
      { id: "approve", label: "Approve MEZO" },
      { id: "deposit", label: "Add 12,000 MEZO" },
    ])
    state = markConfirmed(state, "approve")
    state = markConfirmed(state, "deposit")
    expect(isAllDone(state)).toBe(true)
    expect(hasQueuedAfter(state)).toBe(false)
    expect(state.items.some((item) => item.status === "queued")).toBe(false)
  })

  it("keeps other rows when one fails and retry restores signing", () => {
    const started = createCarousel([
      { id: "1", label: "Vote with veMEZO #5108" },
      { id: "2", label: "Vote with veMEZO #5233" },
    ])
    const failed = markFailed(started, "1", "User rejected the request")
    expect(failed.items[0]?.status).toBe("failed")
    expect(failed.items[1]?.status).toBe("queued")
    const retried = retryItem(failed, "1")
    expect(retried.items[0]?.status).toBe("signing")
    expect(retried.items[1]?.status).toBe("queued")
  })
})
