import { describe, expect, it } from "vitest"
import { runDemoQuery } from "./engine"
import {
  appendSessionResponse,
  latestSessionResponse,
  richSessionBlocks,
} from "./session"

describe("Query tab session", () => {
  it("appends follow-ups without removing a prepared vote", () => {
    const vote = runDemoQuery("vote on the best gauges this epoch")
    const support = runDemoQuery("what is Mezo?")
    const thread = appendSessionResponse(
      appendSessionResponse([], vote),
      support,
    )

    expect(latestSessionResponse(thread)?.kind).toBe("support")
    expect(
      richSessionBlocks(thread).some((block) => block.type === "vote_composer"),
    ).toBe(true)
  })
})
