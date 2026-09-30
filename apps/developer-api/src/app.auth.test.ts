import { errorBodySchema } from "@repo/platform-contracts/errors"
import { describe, expect, it, vi } from "vitest"
import {
  createHarness,
  ids,
  keyIds,
  keys,
  liveOrigin,
  testOrigin,
} from "./testing"

async function errorCode(response: Response): Promise<string> {
  return errorBodySchema.parse(await response.json()).error.code
}

const testnetList = "/v1/gauge-profiles?network=mezo-testnet"
const mainnetList = "/v1/gauge-profiles?network=mezo"

describe("API key auth", () => {
  it("rejects a malformed key with 401 before any store lookup", async () => {
    const harness = await createHarness()
    const lookup = vi.spyOn(harness.store, "findApiKeyByPrefix")
    const response = await harness.get(testnetList, { key: "mbx_sk_nope" })
    expect(response.status).toBe(401)
    expect(await errorCode(response)).toBe("unauthorized")
    expect(lookup).not.toHaveBeenCalled()
  })

  it("rejects a missing Authorization header with 401", async () => {
    const harness = await createHarness()
    const response = await harness.get(testnetList, { key: null })
    expect(response.status).toBe(401)
    expect(response.headers.get("X-Request-Id")).toMatch(/^req_/)
  })

  it("rejects an unknown prefix and a wrong secret with 401", async () => {
    const harness = await createHarness()
    const unknown = keys.skTest.replace("SkTest000001", "SkTest999999")
    const wrongSecret = `${keys.skTest.slice(0, -3)}zzz`
    for (const key of [unknown, wrongSecret]) {
      const response = await harness.get(testnetList, { key })
      expect(response.status).toBe(401)
      expect(await errorCode(response)).toBe("unauthorized")
    }
  })

  it("caches the verified key policy for 15 s", async () => {
    const harness = await createHarness()
    const lookup = vi.spyOn(harness.store, "findApiKeyByPrefix")
    await harness.get(testnetList)
    await harness.get(testnetList)
    expect(lookup).toHaveBeenCalledTimes(1)
    harness.clock.advance(15_001)
    await harness.get(testnetList)
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  type Case = {
    name: string
    key: string
    path: string
    origin?: string
    ip?: string
    status: number
    code?: string
    allowOrigin?: string | null
  }

  const cases: Case[] = [
    {
      name: "publishable + registered origin + matching network",
      key: keys.pkTest,
      path: testnetList,
      origin: testOrigin,
      status: 200,
      allowOrigin: testOrigin,
    },
    {
      name: "publishable + unregistered origin",
      key: keys.pkTest,
      path: testnetList,
      origin: "https://evil.example",
      status: 403,
      code: "origin_not_allowed",
      allowOrigin: null,
    },
    {
      name: "publishable + absent origin",
      key: keys.pkTest,
      path: testnetList,
      status: 403,
      code: "origin_not_allowed",
    },
    {
      name: "publishable + registered origin + network mismatch",
      key: keys.pkTest,
      path: mainnetList,
      origin: testOrigin,
      status: 403,
      code: "network_not_allowed",
      allowOrigin: testOrigin,
    },
    {
      name: "live publishable + registered origin",
      key: keys.pkLive,
      path: mainnetList,
      origin: liveOrigin,
      status: 200,
      allowOrigin: liveOrigin,
    },
    {
      name: "live publishable + test origin",
      key: keys.pkLive,
      path: mainnetList,
      origin: testOrigin,
      status: 403,
      code: "origin_not_allowed",
      allowOrigin: null,
    },
    {
      name: "secret + absent origin",
      key: keys.skTest,
      path: testnetList,
      status: 200,
    },
    {
      name: "secret + any origin (browser use)",
      key: keys.skTest,
      path: testnetList,
      origin: testOrigin,
      status: 403,
      code: "origin_not_allowed",
      allowOrigin: null,
    },
    {
      name: "secret + network mismatch",
      key: keys.skTest,
      path: mainnetList,
      status: 403,
      code: "network_not_allowed",
    },
    {
      name: "live secret + testnet",
      key: keys.skLive,
      path: testnetList,
      status: 403,
      code: "network_not_allowed",
    },
    {
      name: "live secret + mainnet",
      key: keys.skLive,
      path: mainnetList,
      status: 200,
    },
    {
      name: "revoked",
      key: keys.skRevoked,
      path: testnetList,
      status: 401,
      code: "unauthorized",
    },
    {
      name: "expired",
      key: keys.skExpired,
      path: testnetList,
      status: 401,
      code: "unauthorized",
    },
    {
      name: "not yet expired",
      key: keys.skFutureExpiry,
      path: testnetList,
      status: 200,
    },
    {
      name: "unapproved live environment",
      key: keys.skLiveUnapproved,
      path: mainnetList,
      status: 403,
      code: "forbidden",
    },
    {
      name: "approved live environment without gauge-profiles:read",
      key: keys.skLiveNoScope,
      path: mainnetList,
      status: 403,
      code: "forbidden",
    },
    {
      name: "suspended app",
      key: keys.skSuspended,
      path: testnetList,
      status: 403,
      code: "forbidden",
    },
    {
      name: "restricted app keeps read access",
      key: keys.skRestrictedLive,
      path: mainnetList,
      status: 200,
    },
    {
      name: "CIDR allowlist match",
      key: keys.skTestCidr,
      path: testnetList,
      ip: "203.0.113.54",
      status: 200,
    },
    {
      name: "CIDR allowlist miss",
      key: keys.skTestCidr,
      path: testnetList,
      ip: "198.51.100.7",
      status: 403,
      code: "forbidden",
    },
  ]

  it.each(cases)("$name → $status", async (testCase) => {
    const harness = await createHarness()
    const response = await harness.get(testCase.path, {
      key: testCase.key,
      ...(testCase.origin === undefined ? {} : { origin: testCase.origin }),
      ...(testCase.ip === undefined ? {} : { ip: testCase.ip }),
    })
    expect(response.status).toBe(testCase.status)
    if (testCase.code !== undefined) {
      expect(await errorCode(response)).toBe(testCase.code)
    }
    if (testCase.allowOrigin !== undefined) {
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        testCase.allowOrigin,
      )
    }
    expect(response.headers.get("Vary")).toContain("Origin")
    expect(response.headers.get("Vary")).toContain("Authorization")
  })

  it("rejects a CIDR-restricted key when the client IP is unknown", async () => {
    const harness = await createHarness()
    const response = await harness.app.request(testnetList, {
      headers: { Authorization: `Bearer ${keys.skTestCidr}` },
    })
    expect(response.status).toBe(403)
  })

  it("applies development limits to restricted apps", async () => {
    const harness = await createHarness()
    const response = await harness.get(mainnetList, {
      key: keys.skRestrictedLive,
    })
    expect(response.headers.get("RateLimit-Limit")).toBe("60")
    const live = await harness.get(mainnetList, { key: keys.skLive })
    expect(live.headers.get("RateLimit-Limit")).toBe("300")
  })

  it("updates last_used_at at most once per key per 5 minutes", async () => {
    const harness = await createHarness()
    const touch = vi.spyOn(harness.store, "touchKeyLastUsed")
    await harness.get(testnetList)
    await harness.get(testnetList)
    expect(touch).toHaveBeenCalledTimes(1)
    expect(harness.store.lastUsed.get(keyIds.skTest)).toEqual(harness.clock.now)
    harness.clock.advance(5 * 60_000)
    await harness.get(testnetList)
    expect(touch).toHaveBeenCalledTimes(2)
  })

  it("logs one Analytics Engine data point per request", async () => {
    const harness = await createHarness()
    await harness.get(
      "/v1/gauge-profiles/mezo-testnet/0x8E1B4D7A0C3F6E9B2D5A8C1F4E7B0D3A6C9F2E5B",
    )
    await harness.get(testnetList, { key: "garbage" })
    expect(harness.dataPoints).toHaveLength(2)
    const [ok, anonymous] = harness.dataPoints
    expect(ok?.indexes).toEqual([ids.testEnv])
    expect(ok?.blobs.slice(1, 6)).toEqual([
      keyIds.skTest,
      "/v1/gauge-profiles/{network}/{gaugeAddress}",
      "GET",
      "200",
      "full",
    ])
    expect(ok?.blobs[8]).toBe("test")
    expect(ok?.doubles[1]).toBe(200)
    expect(anonymous?.indexes).toEqual(["anonymous"])
    expect(anonymous?.blobs[1]).toBe("")
    expect(anonymous?.blobs[4]).toBe("401")
    expect(anonymous?.blobs[5]).toBe("none")
  })
})
