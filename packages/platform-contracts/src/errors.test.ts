import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  buildErrorBody,
  errorBodySchema,
  errorCodeSchema,
  errorDocsUrl,
  errorStatusByCode,
  issuesFromZodError,
  oauthErrorBodySchema,
} from "./errors"

describe("errors", () => {
  it("builds a valid body with defaults", () => {
    const body = buildErrorBody({ code: "not_found", requestId: "req_1" })
    expect(errorBodySchema.parse(body)).toEqual({
      error: {
        code: "not_found",
        message: "Not found.",
        requestId: "req_1",
        docsUrl: "https://developer.matchbox.markets/docs/errors#not_found",
      },
    })
  })

  it("keeps issues only when present", () => {
    expect(
      buildErrorBody({ code: "invalid_request", requestId: "r", issues: [] })
        .error.issues,
    ).toBeUndefined()
    expect(
      buildErrorBody({
        code: "invalid_request",
        requestId: "r",
        message: "Bad",
        issues: [{ path: "name", message: "Required" }],
      }).error,
    ).toMatchObject({ message: "Bad", issues: [{ path: "name" }] })
  })

  it("maps every code to an HTTP status", () => {
    for (const code of errorCodeSchema.options) {
      expect(errorStatusByCode[code]).toBeGreaterThanOrEqual(400)
      expect(errorDocsUrl(code)).toContain(code)
    }
    expect(errorStatusByCode.rate_limited).toBe(429)
    expect(errorStatusByCode.service_disabled).toBe(503)
  })

  it("converts zod issues to dotted paths", () => {
    const result = z
      .object({ app: z.object({ name: z.string() }) })
      .safeParse({ app: { name: 1 } })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(issuesFromZodError(result.error)[0]?.path).toBe("app.name")
    }
  })

  it("validates OAuth error bodies", () => {
    expect(
      oauthErrorBodySchema.safeParse({ error: "invalid_grant" }).success,
    ).toBe(true)
    expect(oauthErrorBodySchema.safeParse({ error: "nope" }).success).toBe(
      false,
    )
  })
})
