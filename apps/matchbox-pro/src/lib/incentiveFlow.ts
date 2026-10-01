import { parseUnits } from "viem"

export type IncentiveAmount =
  | { valid: true; atomic: bigint }
  | { valid: false; message: string }

export function parseIncentiveAmount(
  value: string,
  decimals: number,
  balance?: bigint,
): IncentiveAmount {
  const trimmed = value.trim().replaceAll(",", "")
  if (!trimmed) return { valid: false, message: "Enter an amount." }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { valid: false, message: "Use a positive number." }
  }
  try {
    const atomic = parseUnits(trimmed, decimals)
    if (atomic <= 0n)
      return { valid: false, message: "Amount must be above zero." }
    if (balance !== undefined && atomic > balance) {
      return { valid: false, message: "Amount exceeds your MEZO balance." }
    }
    return { valid: true, atomic }
  } catch {
    return {
      valid: false,
      message: `Use no more than ${decimals} decimal places.`,
    }
  }
}

// String-based so large or long-fraction inputs never round through a float.
export function formatInputAmount(value: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim().replaceAll(",", ""))
  if (!match) return value
  const whole = (match[1] ?? "0")
    .replace(/^0+(?=\d)/, "")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const fraction = (match[2] ?? "").slice(0, 6).replace(/0+$/, "")
  return fraction ? `${whole}.${fraction}` : whole
}
