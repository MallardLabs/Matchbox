import { describe, expect, it } from "vitest"
import { signInSearchSchema } from "./search"

describe("sign-in search", () => {
  it("accepts a Mezo target chain and drops anything else", () => {
    expect(signInSearchSchema.parse({ chain: 31611, force: true })).toEqual({
      chain: 31611,
      force: true,
    })
    expect(signInSearchSchema.parse({ chain: 1 }).chain).toBeUndefined()
    expect(signInSearchSchema.parse({ chain: "31612" }).chain).toBeUndefined()
  })
})
