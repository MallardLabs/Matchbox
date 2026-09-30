import { describe, expect, it } from "vitest"
import { safeReturnPath } from "./return-path"

describe("safeReturnPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeReturnPath("/authorize?request=abc")).toBe(
      "/authorize?request=abc",
    )
    expect(safeReturnPath("/")).toBe("/")
  })

  it("rejects anything that could leave the origin", () => {
    for (const value of [
      "https://evil.example",
      "//evil.example/x",
      "/\\evil.example",
      "javascript:alert(1)",
      "",
      42,
      undefined,
    ]) {
      expect(safeReturnPath(value)).toBeNull()
    }
  })
})
