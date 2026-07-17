export function percentageToBasisPoints(value: string): bigint | null {
  const trimmed = value.trim()
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(trimmed)) return null
  const [whole = "0", fraction = ""] = trimmed.split(".")
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))
  return result <= 10_000n ? result : null
}

export function allocationTotalBasisPoints(
  values: Iterable<string>,
): bigint | null {
  let total = 0n
  for (const value of values) {
    if (!value.trim()) continue
    const parsed = percentageToBasisPoints(value)
    if (parsed === null) return null
    total += parsed
  }
  return total
}

export function basisPointsToPercentage(value: bigint): string {
  const whole = value / 100n
  const fraction = (value % 100n).toString().padStart(2, "0")
  return fraction === "00" ? whole.toString() : `${whole}.${fraction}`
}

export function equalVoteBasisPoints(itemCount: number): bigint[] {
  if (!Number.isSafeInteger(itemCount) || itemCount <= 0) return []

  const count = BigInt(itemCount)
  const base = 10_000n / count
  const remainder = 10_000n % count

  return Array.from({ length: itemCount }, (_, index) =>
    BigInt(index) < remainder ? base + 1n : base,
  )
}
