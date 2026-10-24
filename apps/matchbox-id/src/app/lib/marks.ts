/**
 * Placeholder marks: app initials on a tile (apps without a logo) and a
 * wallet identicon. Both are derived from the value, so the same app or
 * wallet always looks the same.
 */

export type AppMarkTone = "ink" | "accent" | "neutral"

const appMarkTones: readonly AppMarkTone[] = ["ink", "accent", "neutral"]

/** "Gauge Board" → "GB", "Gaugeboard" → "GA", "" → "?". */
export function appInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
  const [first, second] = words
  if (first === undefined) return "?"
  const letters =
    second === undefined
      ? Array.from(first).slice(0, 2)
      : [Array.from(first)[0], Array.from(second)[0]]
  return letters.join("").toUpperCase()
}

function hashOf(value: string): number {
  let hash = 0
  for (const char of value) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  }
  return hash
}

export function appMarkTone(name: string): AppMarkTone {
  return appMarkTones[hashOf(name) % appMarkTones.length] ?? "ink"
}

/** Two hues taken from the address bytes, as a CSS gradient. */
export function identiconGradient(address: string): string {
  const hex = address.toLowerCase().replace(/^0x/, "").padEnd(8, "0")
  const first = Number.parseInt(hex.slice(0, 4), 16) % 360
  const spread = 60 + (Number.parseInt(hex.slice(4, 8), 16) % 120)
  const second = (first + spread) % 360
  return `linear-gradient(135deg, hsl(${first} 78% 58%), hsl(${second} 72% 52%))`
}
