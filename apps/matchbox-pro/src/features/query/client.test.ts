import { afterEach, describe, expect, it, vi } from "vitest"
import { StuartClientError, askStuart } from "./client"
import { responseFixture } from "./fixtures"

const request = {
  version: 1 as const,
  query: "What should I vote this epoch?",
  sessionId: "7f3a19c0-1111-4222-8333-444455556666",
  turn: 0,
  surface: "palette" as const,
  chainId: 31_612 as const,
}

function mockFetch(response: Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("stuart client", () => {
  it("posts JSON same-origin and parses the response", async () => {
    mockFetch(new Response(JSON.stringify(responseFixture()), { status: 200 }))
    const result = await askStuart(request)
    expect(result.title).toBe("Best return for my veMEZO this epoch")
    const call = vi.mocked(fetch).mock.calls[0]
    expect(call?.[0]).toBe("/api/query")
    expect(call?.[1]?.method).toBe("POST")
  })

  it("maps 429 to a rate-limit error with retry-after", async () => {
    mockFetch(
      new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
    )
    const error = await askStuart(request).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(StuartClientError)
    expect(error).toMatchObject({ code: "rate_limited", retryAfterSeconds: 12 })
    expect(String((error as Error).message)).toContain("12s")
  })

  it("rejects a response that does not match the contract", async () => {
    mockFetch(new Response(JSON.stringify({ version: 1 }), { status: 200 }))
    await expect(askStuart(request)).rejects.toMatchObject({
      code: "bad_response",
    })
  })

  it("reports an unreachable runtime as a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      }),
    )
    await expect(askStuart(request)).rejects.toMatchObject({ code: "network" })
  })

  it("reads the error envelope's code and retry hint", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          error: {
            code: "proposal_expired",
            message: "Proposal expired",
            retryAfterSeconds: null,
          },
        }),
        { status: 400 },
      ),
    )
    await expect(askStuart(request)).rejects.toMatchObject({
      code: "proposal_expired",
      status: 400,
    })
  })
})
