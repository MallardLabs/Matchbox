import type { ApiKeyRecord } from "@repo/platform-contracts/console"
import { describe, expect, it } from "vitest"
import {
  cidrEntryError,
  expiryFor,
  extendsExpiry,
  keyExpiry,
  keyLastUsed,
  rotatedAt,
  sameList,
  shortKeyPrefix,
} from "./api-keys"

const now = Date.parse("2026-10-21T12:00:00.000Z")

function key(overrides: Partial<ApiKeyRecord>): ApiKeyRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    environmentId: "00000000-0000-4000-8000-0000000000e1",
    kind: "secret",
    name: "Server",
    displayPrefix: "mbx_sk_live_AbCdEfGhIjKl",
    allowedCidrs: [],
    status: "active",
    createdBy: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    rotatedFrom: null,
    ...overrides,
  }
}

describe("key labels", () => {
  it("flags expiries within a week", () => {
    expect(keyExpiry(null, now)).toEqual({ label: "Never", soon: false })
    expect(keyExpiry("2026-10-22T10:00:00.000Z", now)).toEqual({
      label: "in 22h",
      soon: true,
    })
    expect(keyExpiry("2027-01-15T12:00:00.000Z", now)).toEqual({
      label: "Jan 15",
      soon: false,
    })
  })

  it("shows recent use relatively and older use as a date", () => {
    expect(keyLastUsed(null, now)).toBe("—")
    expect(keyLastUsed("2026-10-21T11:58:00.000Z", now)).toBe("2m ago")
    expect(keyLastUsed("2026-10-01T12:00:00.000Z", now)).toBe("Oct 1")
  })

  it("maps rotated keys to their replacement's creation time", () => {
    const old = key({ id: "00000000-0000-4000-8000-0000000000aa" })
    const replacement = key({
      id: "00000000-0000-4000-8000-0000000000bb",
      rotatedFrom: old.id,
      createdAt: "2026-10-21T09:00:00.000Z",
    })
    expect(rotatedAt([old, replacement]).get(old.id)).toBe(
      "2026-10-21T09:00:00.000Z",
    )
  })
})

describe("expiry edits", () => {
  it("computes choices and detects extensions", () => {
    expect(expiryFor("never", now)).toBeNull()
    expect(expiryFor("30d", now)).toBe("2026-11-20T12:00:00.000Z")
    expect(extendsExpiry(null, "2026-11-20T12:00:00.000Z")).toBe(false)
    expect(
      extendsExpiry("2026-10-22T00:00:00.000Z", "2026-11-20T12:00:00.000Z"),
    ).toBe(true)
  })
})

describe("cidr entries", () => {
  it("validates new entries against the list", () => {
    expect(cidrEntryError("", [])).toBeNull()
    expect(cidrEntryError("203.0.113.0/24", [])).toBeNull()
    expect(cidrEntryError("2001:db8:4f::/48", [])).toBeNull()
    expect(cidrEntryError("203.0.113.0", [])).toBe("Not a CIDR")
    expect(cidrEntryError("203.0.113.0/24", ["203.0.113.0/24"])).toBe(
      "Already added",
    )
    expect(sameList(["b", "a"], ["a", "b"])).toBe(true)
  })
})

describe("shortKeyPrefix", () => {
  it("keeps the kind and the last four characters", () => {
    expect(shortKeyPrefix("mbx_sk_live_7Hq2LmXo9TbR")).toBe("sk_live_…9TbR")
    expect(shortKeyPrefix("mbx_pk_test_K3vN8wQe1ZpA")).toBe("pk_test_…1ZpA")
    expect(shortKeyPrefix(null)).toBe("—")
  })
})
