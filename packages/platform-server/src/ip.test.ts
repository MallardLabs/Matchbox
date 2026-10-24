import { describe, expect, it } from "vitest"
import ipPrefix, {
  clientIp,
  ipMatchesCidrs,
  ipPrefixFromAddress,
  isValidCidr,
  normalizeCidr,
} from "./ip"

function requestFrom(ip: string | null): Request {
  const headers = new Headers()
  if (ip !== null) headers.set("CF-Connecting-IP", ip)
  return new Request("https://api.matchbox.markets/v1/health", { headers })
}

describe("ipPrefix", () => {
  it("truncates IPv4 to /24", () => {
    expect(ipPrefix(requestFrom("203.0.113.77"))).toBe("203.0.113.0/24")
  })

  it("truncates IPv6 to /48", () => {
    expect(ipPrefix(requestFrom("2001:db8:abcd:12::1"))).toBe(
      "2001:db8:abcd::/48",
    )
  })

  it("unwraps IPv4-mapped IPv6", () => {
    expect(ipPrefix(requestFrom("::ffff:198.51.100.9"))).toBe("198.51.100.0/24")
    expect(clientIp(requestFrom("::ffff:198.51.100.9"))).toBe("198.51.100.9")
  })

  it("returns null for missing or invalid addresses", () => {
    expect(ipPrefix(requestFrom(null))).toBeNull()
    expect(ipPrefix(requestFrom("not-an-ip"))).toBeNull()
    expect(ipPrefixFromAddress("999.1.1.1")).toBeNull()
  })
})

describe("CIDR helpers", () => {
  it("normalizes and validates CIDRs", () => {
    expect(normalizeCidr("10.1.2.3/8")).toBe("10.0.0.0/8")
    expect(normalizeCidr("2001:db8::1/32")).toBe("2001:db8::/32")
    expect(normalizeCidr("10.0.0.0/33")).toBeNull()
    expect(isValidCidr("10.0.0.0")).toBe(false)
  })

  it("matches addresses against allowlists", () => {
    const cidrs = ["10.0.0.0/8", "2001:db8::/32"]
    expect(ipMatchesCidrs("10.20.30.40", cidrs)).toBe(true)
    expect(ipMatchesCidrs("11.0.0.1", cidrs)).toBe(false)
    expect(ipMatchesCidrs("2001:db8:1::5", cidrs)).toBe(true)
    expect(ipMatchesCidrs("::ffff:10.0.0.1", cidrs)).toBe(true)
    expect(ipMatchesCidrs("10.0.0.1", [])).toBe(false)
    expect(ipMatchesCidrs("garbage", cidrs)).toBe(false)
    expect(ipMatchesCidrs("10.0.0.1", ["bad"])).toBe(false)
  })
})
