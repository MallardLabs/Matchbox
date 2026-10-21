import { keccak256, toBytes } from "viem"

// Stable JSON: object keys sorted at every depth, so the same content always
// hashes the same regardless of construction order.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`
  }
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`
}

export function keccakJson(value: unknown): `0x${string}` {
  return keccak256(toBytes(canonicalJson(value)))
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  )
}

export async function hmacHex(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  return toHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  )
}

export function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

let ephemeralSecret: string | null = null

// Without PROPOSAL_HMAC_SECRET, handles are signed with a per-isolate random
// key: they still cannot be forged, but only refresh inside the same isolate.
export function proposalSecret(configured: string | null): string {
  if (configured) return configured
  if (!ephemeralSecret) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    ephemeralSecret = [...bytes]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  }
  return ephemeralSecret
}
