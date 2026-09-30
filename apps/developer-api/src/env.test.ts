import { describe, expect, it } from "vitest"
import { parseWorkerEnv } from "./env"

const bindings = {
  RATE_LIMITER: { idFromName() {}, get() {} },
  REQUEST_LOG: { writeDataPoint() {} },
}

const supabaseEnv = {
  ...bindings,
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  API_KEY_PEPPER: "p".repeat(32),
}

describe("parseWorkerEnv", () => {
  it("accepts a complete production env with defaults", () => {
    const result = parseWorkerEnv(supabaseEnv)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.env.ENVIRONMENT).toBe("production")
      expect(result.env.PLATFORM_STORE).toBe("supabase")
      expect(result.env.MEZO_MAINNET_RPC_URL).toBeNull()
    }
  })

  it("requires Supabase secrets and a long pepper outside memory mode", () => {
    const result = parseWorkerEnv({ ...bindings, API_KEY_PEPPER: "short" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problems.join("\n")).toContain("SUPABASE_URL")
      expect(result.problems.join("\n")).toContain("API_KEY_PEPPER")
      expect(result.problems.join("\n")).not.toContain("short")
    }
  })

  it("parses PUBLISHABLE_QUOTA_SHARE as a fraction in (0, 1]", () => {
    const share = (value: string | undefined) => {
      const result = parseWorkerEnv({
        ...supabaseEnv,
        PUBLISHABLE_QUOTA_SHARE: value,
      })
      return result.ok ? result.env.PUBLISHABLE_QUOTA_SHARE : "invalid"
    }
    expect(share(undefined)).toBeNull()
    expect(share("")).toBeNull()
    expect(share("0.25")).toBe(0.25)
    expect(share("1")).toBe(1)
    expect(share("0")).toBe("invalid")
    expect(share("1.5")).toBe("invalid")
    expect(share("half")).toBe("invalid")
  })

  it("refuses memory mode in production", () => {
    expect(parseWorkerEnv({ ...bindings, PLATFORM_STORE: "memory" }).ok).toBe(
      false,
    )
    expect(
      parseWorkerEnv({
        ...bindings,
        PLATFORM_STORE: "memory",
        ENVIRONMENT: "development",
      }).ok,
    ).toBe(true)
  })

  it("requires the rate limiter binding", () => {
    const { RATE_LIMITER: _limiter, ...rest } = supabaseEnv
    expect(parseWorkerEnv(rest).ok).toBe(false)
  })
})
