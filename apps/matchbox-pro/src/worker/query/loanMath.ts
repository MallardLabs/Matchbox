// mUSD trove math, identical to LiquityMath: 1e18 fixed point, floor
// division, liquidatable iff ICR < MCR (strict). Ratios are shown as basis
// points rounded half up; liquidation prices round up to the cent.

const BPS = 10_000n

export type LoanBand = "healthy" | "near_liquidation" | "liquidatable"

export function collateralRatio(
  coll: bigint,
  price: bigint,
  debt: bigint,
): bigint | null {
  if (debt <= 0n) return null
  return (coll * price) / debt
}

/** 1e18 ratio (1e18 = 100%) → basis points, rounded half up. */
export function ratioToBps(ratio: bigint): number {
  return Number((ratio + 5n * 10n ** 13n) / 10n ** 14n)
}

/** USD/BTC at which ICR equals MCR, 1e18-scaled, rounded up. */
export function liquidationPrice(
  mcr: bigint,
  debt: bigint,
  coll: bigint,
): bigint | null {
  if (coll <= 0n || debt <= 0n) return null
  return (mcr * debt + coll - 1n) / coll
}

/** 1e18 USD → micro-USD, floored. */
export function wadToMicro(value: bigint): bigint {
  return value / 10n ** 12n
}

/** 1e18 USD → micro-USD rounded up to the cent. */
export function wadToMicroCeilCent(value: bigint): bigint {
  const micro = (value + 10n ** 12n - 1n) / 10n ** 12n
  return ((micro + 9_999n) / 10_000n) * 10_000n
}

/** Percentage BTC can fall before liquidation, in bps (floored, ≥ 0). */
export function dropToLiquidationBps(price: bigint, liqPrice: bigint): number {
  if (price <= 0n || liqPrice >= price) return 0
  return Number(((price - liqPrice) * BPS) / price)
}

export function bandFor(
  ratio: bigint | null,
  mcr: bigint,
  ccr: bigint,
): LoanBand {
  if (ratio === null) return "healthy"
  if (ratio < mcr) return "liquidatable"
  if (ratio < ccr) return "near_liquidation"
  return "healthy"
}

export type ScenarioPoint = {
  shockBps: number
  price: bigint
  ratio: bigint | null
  band: LoanBand
}

export function scenarioPoint(input: {
  coll: bigint
  debt: bigint
  price: bigint
  shockBps: number
  mcr: bigint
  ccr: bigint
}): ScenarioPoint {
  const price = (input.price * (BPS + BigInt(input.shockBps))) / BPS
  const ratio = collateralRatio(input.coll, price, input.debt)
  return {
    shockBps: input.shockBps,
    price,
    ratio,
    band: bandFor(ratio, input.mcr, input.ccr),
  }
}

/** Smallest bps drop (as a negative shock) at which the trove is liquidatable. */
export function liquidationShockBps(input: {
  coll: bigint
  debt: bigint
  price: bigint
  mcr: bigint
}): number | null {
  const liq = liquidationPrice(input.mcr, input.debt, input.coll)
  if (liq === null || liq >= input.price) return null
  let shock = -(dropToLiquidationBps(input.price, liq) + 1)
  for (let attempt = 0; attempt < 3 && shock >= -9_900; attempt += 1) {
    const point = scenarioPoint({ ...input, shockBps: shock, ccr: input.mcr })
    if (point.band === "liquidatable") return shock
    shock -= 1
  }
  return shock >= -9_900 ? shock : null
}

export function maxPartialRepay(
  debt: bigint,
  gasCompensation: bigint,
  minNetDebt: bigint,
): bigint {
  const max = debt - gasCompensation - minNetDebt
  return max > 0n ? max : 0n
}

/** Interest is repaid first, then principal. */
export function repaySplit(
  amount: bigint,
  interest: bigint,
): { interestRepaid: bigint; principalRepaid: bigint } {
  const interestRepaid = amount < interest ? amount : interest
  return { interestRepaid, principalRepaid: amount - interestRepaid }
}
