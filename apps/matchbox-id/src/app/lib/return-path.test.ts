import { describe, expect, it } from "vitest"
import { authorizationRequestIdOf, safeReturnPath } from "./return-path"

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

describe("authorizationRequestIdOf", () => {
  it("reads the request id of a consent return path only", () => {
    const id = "3f1c5f6e-8a9b-4c2d-9e0f-1a2b3c4d5e6f"
    expect(authorizationRequestIdOf(`/authorize?request=${id}`)).toBe(id)
    expect(authorizationRequestIdOf("/authorize?request=nope")).toBeNull()
    expect(authorizationRequestIdOf(`/apps?request=${id}`)).toBeNull()
    expect(authorizationRequestIdOf(null)).toBeNull()
  })
})
