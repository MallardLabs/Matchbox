import { FixedPoint, Money, Rational } from "@thesis-co/cent"

export type UsdAmount = ReturnType<typeof Money>

export function usd(value: string): UsdAmount {
  return Money(`USD ${value}`)
}

export function zeroUsd(): UsdAmount {
  return usd("0")
}

export function usdDecimal(value: UsdAmount): string {
  return value.amount.toString()
}

export function addUsd(values: readonly UsdAmount[]): UsdAmount {
  return values.reduce((total, value) => total.add(value), zeroUsd())
}

export function tokenValueUsd(input: {
  rawAmount: bigint
  decimals: number
  priceUsd: string
}): UsdAmount {
  return usd(input.priceUsd).multiply(
    FixedPoint(input.rawAmount, BigInt(input.decimals)),
  )
}

export function proportionalUsd(
  value: UsdAmount,
  numerator: bigint,
  denominator: bigint,
): UsdAmount {
  if (numerator <= 0n || denominator <= 0n) return zeroUsd()
  const ratio = Rational(numerator, denominator).toDecimalString(18n)
  return value.multiply(FixedPoint(ratio))
}

export function compareUsd(left: UsdAmount, right: UsdAmount): number {
  return left.compare(right)
}
