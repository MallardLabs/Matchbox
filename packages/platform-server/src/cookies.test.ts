import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import {
  clearSessionCookie,
  hostCookieName,
  parseCookieHeader,
  readSessionCookie,
  readSessionCookieFromHeader,
  serializeClearedSessionCookie,
  serializeSessionCookie,
  setSessionCookie,
} from "./cookies"

describe("session cookies", () => {
  it("serializes __Host- cookies with strict attributes", () => {
    expect(serializeSessionCookie("mbx_id", "abc-_123", 604_800)).toBe(
      "__Host-mbx_id=abc-_123; Max-Age=604800; Path=/; Secure; HttpOnly; SameSite=Strict",
    )
    expect(serializeClearedSessionCookie("mbx_id")).toBe(
      "__Host-mbx_id=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict",
    )
  })

  it("rejects unsafe names and values", () => {
    expect(() => hostCookieName("a;b")).toThrow()
    expect(() => serializeSessionCookie("mbx_id", "a b", 60)).toThrow()
    expect(() => serializeSessionCookie("mbx_id", "abc", 0)).toThrow()
  })

  it("parses cookie headers, keeping the first duplicate", () => {
    const cookies = parseCookieHeader("a=1; __Host-mbx_id=tok; a=2; broken; =x")
    expect(cookies.get("a")).toBe("1")
    expect(cookies.get("__Host-mbx_id")).toBe("tok")
    expect(cookies.size).toBe(2)
    expect(parseCookieHeader(null).size).toBe(0)
  })

  it("reads only well-formed __Host- session cookies", () => {
    expect(readSessionCookieFromHeader("__Host-mbx_id=tok_1", "mbx_id")).toBe(
      "tok_1",
    )
    expect(readSessionCookieFromHeader("mbx_id=tok", "mbx_id")).toBeNull()
    expect(
      readSessionCookieFromHeader("__Host-mbx_id=bad%20value", "mbx_id"),
    ).toBeNull()
  })

  it("sets, reads and clears through Hono", async () => {
    const app = new Hono()
    app.post("/sign-in", (c) => {
      setSessionCookie(c, "mbx_dev", "session-token", 3600)
      return c.json({ ok: true })
    })
    app.post("/sign-out", (c) => {
      clearSessionCookie(c, "mbx_dev")
      return c.json({ ok: true })
    })
    app.get("/me", (c) => c.json({ token: readSessionCookie(c, "mbx_dev") }))

    const signIn = await app.request("/sign-in", { method: "POST" })
    expect(signIn.headers.get("Set-Cookie")).toContain(
      "__Host-mbx_dev=session-token",
    )
    const me = await app.request("/me", {
      headers: { Cookie: "__Host-mbx_dev=session-token" },
    })
    expect(await me.json()).toEqual({ token: "session-token" })
    const signOut = await app.request("/sign-out", { method: "POST" })
    expect(signOut.headers.get("Set-Cookie")).toContain("Max-Age=0")
  })
})
