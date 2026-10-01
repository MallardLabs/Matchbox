import { describe, expect, it } from "vitest"
import { validateSingleVotingDomain } from "./tools"

describe("custom vote safety", () => {
  it("rejects one custom ballot spanning multiple voting domains", () => {
    expect(() =>
      validateSingleVotingDomain([
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ]),
    ).toThrow(/one voting domain/i)
  })
})
