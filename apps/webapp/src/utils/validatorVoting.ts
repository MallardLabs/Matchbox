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
