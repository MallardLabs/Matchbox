import type { ApiKeyRecord } from "@repo/platform-contracts/console"
import { parseCidrList } from "./cidr"
import { dash, formatAgo, formatMonthDay, formatSpan } from "./format"

const day = 86_400_000

/** "Never", "in 22h" (soon: under 7 days), "Jan 15", or the past date. */
export function keyExpiry(
  expiresAt: string | null,
  now: number,
): { label: string; soon: boolean } {
  if (expiresAt === null) return { label: "Never", soon: false }
  const left = Date.parse(expiresAt) - now
  if (left > 0 && left < 7 * day) {
    const span = formatSpan(left / 1000).split(" ")[0] ?? ""
    return { label: `in ${span}`, soon: true }
  }
  return { label: formatMonthDay(expiresAt), soon: false }
}

/** "2m ago" within a week, else the date; dash when never used. */
export function keyLastUsed(lastUsedAt: string | null, now: number): string {
  if (lastUsedAt === null) return dash
  const ago = (now - Date.parse(lastUsedAt)) / 1000
  return ago < 7 * 86_400
    ? formatAgo(Math.max(0, ago))
    : formatMonthDay(lastUsedAt)
}

/** Old key id → when its replacement was created ("Rotated Oct 21"). */
export function rotatedAt(keys: readonly ApiKeyRecord[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const key of keys) {
    if (key.rotatedFrom !== null) map.set(key.rotatedFrom, key.createdAt)
  }
  return map
}

export const expiryChoices = {
  never: { label: "Never", days: null },
  "30d": { label: "30 d", days: 30 },
  "90d": { label: "90 d", days: 90 },
  "365d": { label: "1 y", days: 365 },
} as const

export type ExpiryChoice = keyof typeof expiryChoices

export function isExpiryChoice(value: string): value is ExpiryChoice {
  return value in expiryChoices
}

/** ISO expiry for a choice, or null for "Never". */
export function expiryFor(choice: ExpiryChoice, now: number): string | null {
  const days = expiryChoices[choice].days
  return days === null ? null : new Date(now + days * day).toISOString()
}

/** True when moving the expiry later than it is (needs step-up). */
export function extendsExpiry(current: string | null, next: string): boolean {
  return current !== null && Date.parse(next) > Date.parse(current)
}

/** Problem with a CIDR about to be added, or null. */
export function cidrEntryError(
  value: string,
  existing: readonly string[],
): string | null {
  const entry = value.trim()
  if (entry === "") return null
  const { invalid } = parseCidrList(entry)
  if (invalid.length > 0 || entry.includes(" ")) return "Not a CIDR"
  if (existing.includes(entry)) return "Already added"
  return null
}

export function sameList(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return [...left].sort().join(",") === [...right].sort().join(",")
}

/** "mbx_sk_live_7Hq2LmXo9TbR" → "sk_live_…9TbR" for dense tables. */
export function shortKeyPrefix(prefix: string | null): string {
  if (prefix === null) return dash
  const bare = prefix.replace(/^mbx_/, "")
  const match = /^([a-z]+_[a-z]+_)(.+)$/.exec(bare)
  if (match === null) return bare
  const [, head = "", rest = ""] = match
  return rest.length <= 6 ? bare : `${head}…${rest.slice(-4)}`
}
