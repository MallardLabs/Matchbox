import { UserRejectedRequestError } from "viem"
import { describe, expect, it } from "vitest"
import { describeWriteError } from "./writeErrors"

describe("describeWriteError", () => {
  it("treats a wallet rejection as rejected, not a fallback trigger", () => {
    const error = new UserRejectedRequestError(new Error("User denied"))
    expect(describeWriteError(error).kind).toBe("rejected")
  })

  it("recognises EIP-5792 unsupported-method codes", () => {
    expect(describeWriteError({ code: 4200 }).kind).toBe("unsupported")
    expect(describeWriteError({ code: -32601 }).kind).toBe("unsupported")
  })

  it("flags a bundle status timeout so the user checks before retrying", () => {
    const error = new Error("timed out")
    error.name = "WaitForCallsStatusTimeoutError"
    expect(describeWriteError(error).kind).toBe("timeout")
  })

  it("keeps an unknown error's message", () => {
    const failure = describeWriteError(new Error("execution reverted"))
    expect(failure).toEqual({ kind: "unknown", message: "execution reverted" })
  })
})
