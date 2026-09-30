import { meResponseSchema } from "@repo/platform-contracts/console"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { ApiError, apiRequest, buildUrl, setFetch } from "./api-client"

const me = {
  account: {
    id: "8c1f6d0e-54a4-4b8e-9d5c-7a3b2f1e0d9c",
    email: "dev@matchbox.local",
    emailVerifiedAt: "2026-09-30T12:00:00.000Z",
    displayName: "Dev",
    createdAt: "2026-09-30T12:00:00.000Z",
  },
  organizations: [],
  staffRole: null,
  session: {
    id: "3d2c1b0a-9f8e-4d7c-8b6a-5f4e3d2c1b0a",
    expiresAt: "2026-10-07T12:00:00.000Z",
    steppedUpUntil: null,
  },
}

let restore: (() => void) | null = null

function respond(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  restore = setFetch(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
      }),
  )
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error("Expected the request to fail")
}

afterEach(() => {
  restore?.()
  restore = null
})

describe("apiRequest", () => {
  it("returns data parsed by the contract schema", async () => {
    respond(200, me)
    await expect(apiRequest(meResponseSchema, "/api/me")).resolves.toEqual(me)
  })

  it("rejects a 2xx body that does not match the schema", async () => {
    respond(200, { ...me, staffRole: "admin" }, { "X-Request-Id": "req_1" })
    const error = await failure(apiRequest(meResponseSchema, "/api/me"))
    expect(error.code).toBe("invalid_response")
    expect(error.requestId).toBe("req_1")
  })

  it("maps platform error bodies to ApiError with issues", async () => {
    respond(400, {
      error: {
        code: "invalid_request",
        message: "Bad",
        requestId: "req_2",
        docsUrl:
          "https://developer.matchbox.markets/docs/errors#invalid_request",
        issues: [{ path: "name", message: "Required" }],
      },
    })
    const error = await failure(
      apiRequest(z.object({}), "/api/x", { method: "POST", body: {} }),
    )
    expect(error.code).toBe("invalid_request")
    expect(error.status).toBe(400)
    expect(error.issueFor("name")).toBe("Required")
  })

  it("keeps the step-up code for the 403 retry flow", async () => {
    respond(403, {
      error: {
        code: "step_up_required",
        message: "Confirm with your passkey to continue.",
        requestId: "req_3",
        docsUrl:
          "https://developer.matchbox.markets/docs/errors#step_up_required",
      },
    })
    const error = await failure(apiRequest(z.object({}), "/api/x"))
    expect(error.code).toBe("step_up_required")
    expect(error.status).toBe(403)
  })

  it("treats an unknown error body as invalid_response", async () => {
    respond(418, { nope: true })
    const error = await failure(apiRequest(z.object({}), "/api/x"))
    expect(error.code).toBe("invalid_response")
  })

  it("reports network failures", async () => {
    restore = setFetch(async () => {
      throw new TypeError("Failed to fetch")
    })
    const error = await failure(apiRequest(z.object({}), "/api/x"))
    expect(error.code).toBe("network_error")
  })
})

describe("buildUrl", () => {
  it("drops empty values", () => {
    expect(
      buildUrl("/api/x", { a: "1", b: undefined, c: "", d: null, e: 2 }),
    ).toBe("/api/x?a=1&e=2")
  })
})
