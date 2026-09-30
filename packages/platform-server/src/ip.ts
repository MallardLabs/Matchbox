import ipaddr from "ipaddr.js"

/**
 * Client IP helpers. Only the truncated prefix (IPv4 /24, IPv6 /48) is ever
 * stored or logged.
 */

type HeaderSource = { headers: { get(name: string): string | null } }

/** `CF-Connecting-IP`, normalized (IPv4-mapped IPv6 → IPv4); null if absent. */
export function clientIp(request: HeaderSource): string | null {
  const raw = request.headers.get("CF-Connecting-IP")?.trim()
  if (raw === undefined || raw.length === 0 || !ipaddr.isValid(raw)) {
    return null
  }
  return ipaddr.process(raw).toString()
}

export function ipPrefixFromAddress(address: string): string | null {
  if (!ipaddr.isValid(address)) return null
  const parsed = ipaddr.process(address)
  if (parsed.kind() === "ipv4") {
    return `${ipaddr.IPv4.networkAddressFromCIDR(`${parsed.toString()}/24`).toString()}/24`
  }
  return `${ipaddr.IPv6.networkAddressFromCIDR(`${parsed.toString()}/48`).toString()}/48`
}

/** IPv4 /24 or IPv6 /48 of the client, e.g. `203.0.113.0/24`. */
export default function ipPrefix(request: HeaderSource): string | null {
  const ip = clientIp(request)
  return ip === null ? null : ipPrefixFromAddress(ip)
}

/** Canonical CIDR (`10.0.0.0/8`), or null when invalid. */
export function normalizeCidr(cidr: string): string | null {
  try {
    const [address, prefix] = ipaddr.parseCIDR(cidr.trim())
    const network =
      address.kind() === "ipv4"
        ? ipaddr.IPv4.networkAddressFromCIDR(`${address.toString()}/${prefix}`)
        : ipaddr.IPv6.networkAddressFromCIDR(`${address.toString()}/${prefix}`)
    return `${network.toString()}/${prefix}`
  } catch {
    return null
  }
}

export function isValidCidr(cidr: string): boolean {
  return normalizeCidr(cidr) !== null
}

/** True when `address` is inside any CIDR (an empty list matches nothing). */
export function ipMatchesCidrs(
  address: string,
  cidrs: readonly string[],
): boolean {
  if (!ipaddr.isValid(address)) return false
  const parsed = ipaddr.process(address)
  return cidrs.some((cidr) => {
    try {
      const range = ipaddr.parseCIDR(cidr)
      const [network] = range
      return parsed.kind() === network.kind() && parsed.match(range)
    } catch {
      return false
    }
  })
}
