import { createLogger } from "@repo/logger"
import { errorBodySchema } from "@repo/platform-contracts/errors"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { formBody, jsonBody, pathParams, queryParams } from "./body"
import { PlatformError } from "./errors"
import {
  errorHandler,
  notFoundHandler,
  requestId,
  requireFlag,
  requireSameOrigin,
  securityHeaders,
} from "./middleware"

const logged: string[] = []
const silentLogger = createLogger({
  format: "json",
  sink(_level, line) {
    logged.push(line)
  },
})

function createApp() {
  const app = new Hono()
  app.use(requestId({ logger: silentLogger }))
  app.use(securityHeaders())
  app.onError(errorHandler())
  app.notFound(notFoundHandler)
  return app
}

async function errorBody(response: Response) {
  return errorBodySchema.parse(await response.json())
}

describe("requestId", () => {
  it("sets a fresh id on every response and ignores inbound ids", async () => {
    const app = createApp()
    app.get("/", (c) => c.json({ id: c.var.requestId }))
    const response = await app.request("/", {
      headers: { "X-Request-Id": "attacker" },
    })
    const header = response.headers.get("X-Request-Id")
    expect(header).toMatch(/^req_[0-9A-Za-z]{24}$/)
    expect(await response.json()).toEqual({ id: header })
  })
})

describe("errorHandler", () => {
  it("renders PlatformError with code, status, headers and issues", async () => {
    const app = createApp()
    app.get("/limited", () => {
      throw new PlatformError("rate_limited", {
        headers: { "Retry-After": "30" },
      })
    })
    const response = await app.request("/limited")
    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("30")
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    const body = await errorBody(response)
    expect(body.error.code).toBe("rate_limited")
    expect(body.error.requestId).toBe(response.headers.get("X-Request-Id"))
    expect(body.error.docsUrl).toContain("#rate_limited")
  })

  it("hides unexpected error details and logs them", async () => {
    const app = createApp()
    app.get("/boom", () => {
      throw new Error("database password is hunter2")
    })
    logged.length = 0
    const response = await app.request("/boom")
    expect(response.status).toBe(500)
    const body = await errorBody(response)
    expect(body.error.code).toBe("internal_error")
    expect(JSON.stringify(body)).not.toContain("hunter2")
    expect(logged.join("\n")).toContain("hunter2")
    expect(logged.join("\n")).toContain(body.error.requestId)
  })

  it("maps Hono HTTP exceptions", async () => {
    const app = createApp()
    app.get("/unauthorized", () => {
      throw new HTTPException(401)
    })
    app.get("/too-large", () => {
      throw new HTTPException(413)
    })
    expect(
      (await errorBody(await app.request("/unauthorized"))).error.code,
    ).toBe("unauthorized")
    const tooLarge = await app.request("/too-large")
    expect(tooLarge.status).toBe(400)
    expect((await errorBody(tooLarge)).error.code).toBe("invalid_request")
  })

  it("renders 404 for unknown routes", async () => {
    const response = await createApp().request("/nope")
    expect(response.status).toBe(404)
    expect((await errorBody(response)).error.code).toBe("not_found")
    expect(response.headers.get("X-Request-Id")).toMatch(/^req_/)
  })
})

describe("securityHeaders", () => {
  it("adds defaults without overriding route headers", async () => {
    const app = createApp()
    app.get("/", (c) => {
      c.header("X-Frame-Options", "SAMEORIGIN")
      return c.text("ok")
    })
    const response = await app.request("/")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN")
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    )
    expect(response.headers.get("Strict-Transport-Security")).toContain(
      "max-age=",
    )
  })
})

describe("requireSameOrigin", () => {
  function originApp() {
    const app = createApp()
    app.use("/api/*", requireSameOrigin())
    app.get("/api/thing", (c) => c.json({ ok: true }))
    app.post("/api/thing", (c) => c.json({ ok: true }))
    return app
  }

  it("allows safe methods without Origin", async () => {
    const response = await originApp().request("http://localhost/api/thing")
    expect(response.status).toBe(200)
  })

  it("allows same-origin writes", async () => {
    const response = await originApp().request("http://localhost/api/thing", {
      method: "POST",
      headers: { Origin: "http://localhost" },
    })
    expect(response.status).toBe(200)
  })

  it("blocks cross-origin or origin-less writes", async () => {
    for (const headers of [
      { Origin: "https://evil.example" },
      {} satisfies Record<string, string>,
    ]) {
      const response = await originApp().request("http://localhost/api/thing", {
        method: "POST",
        headers,
      })
      expect(response.status).toBe(403)
      expect((await errorBody(response)).error.code).toBe("forbidden")
    }
  })
})

describe("requireFlag", () => {
  it("returns 503 service_disabled when off", async () => {
    const app = createApp()
    app.use(
      "/v1/*",
      requireFlag(() => false),
    )
    app.get("/v1/x", (c) => c.text("ok"))
    const response = await app.request("/v1/x")
    expect(response.status).toBe(503)
    expect((await errorBody(response)).error.code).toBe("service_disabled")
  })
})

describe("jsonBody", () => {
  const schema = z.object({ name: z.string().min(1), count: z.number().int() })

  function bodyApp() {
    const app = createApp()
    app.post("/", async (c) =>
      c.json(await jsonBody(c, schema, { maxBytes: 64 })),
    )
    return app
  }

  it("returns parsed data", async () => {
    const response = await bodyApp().request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ name: "a", count: 1 }),
    })
    expect(await response.json()).toEqual({ name: "a", count: 1 })
  })

  it.each([
    ["wrong content type", "text/plain", '{"name":"a","count":1}'],
    ["malformed JSON", "application/json", "{"],
    ["schema mismatch", "application/json", '{"name":"","count":1.5}'],
    [
      "too large",
      "application/json",
      JSON.stringify({ name: "x".repeat(100), count: 1 }),
    ],
  ])("rejects %s with invalid_request", async (_label, contentType, body) => {
    const response = await bodyApp().request("/", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    })
    expect(response.status).toBe(400)
    expect((await errorBody(response)).error.code).toBe("invalid_request")
  })

  it("reports field issues", async () => {
    const response = await bodyApp().request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"name":"","count":1}',
    })
    const body = await errorBody(response)
    expect(body.error.issues?.[0]?.path).toBe("name")
  })
})

describe("formBody", () => {
  const schema = z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string(),
  })

  function formApp() {
    const app = createApp()
    app.post("/token", async (c) => c.json(await formBody(c, schema)))
    return app
  }

  async function post(
    body: string,
    contentType = "application/x-www-form-urlencoded",
  ) {
    const response = await formApp().request("/token", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    })
    return response.json()
  }

  it("parses urlencoded bodies without throwing", async () => {
    expect(await post("grant_type=refresh_token&refresh_token=abc")).toEqual({
      ok: true,
      data: { grant_type: "refresh_token", refresh_token: "abc" },
    })
    expect(await post("grant_type=refresh_token")).toEqual({
      ok: false,
      reason: "invalid",
    })
    expect(
      await post("grant_type=refresh_token&refresh_token=a&refresh_token=b"),
    ).toEqual({ ok: false, reason: "duplicate-parameter" })
    expect(await post("{}", "application/json")).toEqual({
      ok: false,
      reason: "malformed",
    })
  })
})

describe("queryParams and pathParams", () => {
  it("validates query and path params", async () => {
    const app = createApp()
    app.get("/items/:id", (c) => {
      const { id } = pathParams(c, z.object({ id: z.uuid() }))
      const { limit } = queryParams(
        c,
        z.object({ limit: z.coerce.number().int().max(10) }),
      )
      return c.json({ id, limit })
    })
    const id = "4b9a3b2e-8f25-4a55-9f0e-4f7f2b9a1c3d"
    expect(await (await app.request(`/items/${id}?limit=5`)).json()).toEqual({
      id,
      limit: 5,
    })
    expect((await app.request(`/items/${id}?limit=50`)).status).toBe(400)
    expect((await app.request("/items/nope?limit=5")).status).toBe(404)
  })
})
