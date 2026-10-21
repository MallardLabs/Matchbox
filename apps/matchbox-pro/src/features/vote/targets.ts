import {
  formatTokenAmountDigits,
  priceToMicroUsd,
  tokenUsdMicroValue,
} from "@/lib/money"
import { calculateAnnualizedReturnBasisPoints } from "@/lib/rewardOptimizer"
import { referencePriceUsd } from "@/lib/tokenUsd"
import type { TargetFooter } from "./model"
import type { RewardToken } from "./projection"

const E18 = 10n ** 18n
/** Sort key for "∞" APY so an empty-but-funded target ranks first. */
export const INFINITE_APY = 10n ** 30n

export type Prices = { btc: string | null; mezo: string | null }

export type UnpricedReward = Omit<RewardToken, "microUsd"> & {
  /** Market price from the Mezo pools API, used only without a reference price. */
  priceUsd?: string | null
}

export function priceRewards(
  rewards: readonly UnpricedReward[],
  prices: Prices,
): RewardToken[] {
  return rewards
    .filter((reward) => reward.amount > 0n)
    .map(({ priceUsd, ...reward }) => {
      const price =
        referencePriceUsd({
          tokenAddress: reward.tokenAddress,
          symbol: reward.symbol,
          btcPriceUsd: prices.btc,
          mezoPriceUsd: prices.mezo,
        }) ??
        priceUsd ??
        null
      return {
        ...reward,
        microUsd: price
          ? tokenUsdMicroValue(reward.amount, reward.decimals, price)
          : null,
      }
    })
}

export function sumPriced(rewards: readonly RewardToken[]): {
  microUsd: bigint
  hasUnpriced: boolean
} {
  let microUsd = 0n
  let hasUnpriced = false
  for (const reward of rewards) {
    if (reward.microUsd === null) hasUnpriced = true
    else microUsd += reward.microUsd
  }
  return { microUsd, hasUnpriced }
}

/**
 * Annualised return on the asset backing the votes (MEZO for veMEZO, BTC for
 * veBTC). A funded target with no votes yet is unbounded: -1 renders as "∞".
 */
export function targetApy(
  incentiveMicroUsd: bigint,
  totalWeight: bigint,
  assetPrice: string | null,
): bigint | null {
  if (!assetPrice || incentiveMicroUsd <= 0n) return null
  if (totalWeight <= 0n) return -1n
  return calculateAnnualizedReturnBasisPoints({
    epochRewardMicroUsd: incentiveMicroUsd,
    votingPowers: [totalWeight],
    assetPriceMicroUsd: priceToMicroUsd(assetPrice),
  })
}

/** Reward one more `unit` of votes would earn this epoch. */
export function rewardPerUnit(
  incentiveMicroUsd: bigint,
  totalWeight: bigint,
  unit: bigint,
): bigint {
  if (incentiveMicroUsd <= 0n) return 0n
  return (incentiveMicroUsd * unit) / (totalWeight + unit)
}

export const PER_10K_VEMEZO = 10_000n * E18
export const PER_VEBTC = E18

export function formatWhole(amount: bigint): string {
  return formatTokenAmountDigits(amount, 18, 0)
}

export function formatVeBtc(amount: bigint): string {
  return formatTokenAmountDigits(amount, 18, 4)
}

/** "12.4%" share of a voter's total weight. */
export function formatShare(weight: bigint, total: bigint): string {
  if (total <= 0n) return "—"
  const tenths = (weight * 1_000n) / total
  return `${tenths / 10n}.${tenths % 10n}%`
}

export function shareBps(weight: bigint, total: bigint): bigint {
  return total > 0n ? (weight * 10_000n) / total : 0n
}

export function boostFooter(input: {
  optimal: bigint | undefined
  weight: bigint
  boost: number
}): TargetFooter {
  const { optimal, weight, boost } = input
  const atMax = boost >= 5
  const over = optimal !== undefined && weight > optimal ? weight - optimal : 0n
  const shortfall =
    optimal !== undefined && optimal > weight ? optimal - weight : 0n
  const tenths = Math.round(boost * 10)
  const fill =
    optimal !== undefined && optimal > 0n
      ? Number(((weight >= optimal ? optimal : weight) * 1_000n) / optimal) /
        1_000
      : 0
  // Past the optimum the bar splits by weight: green for the optimal part,
  // red for the oversubscribed remainder.
  const overFraction = over > 0n ? Number((over * 1_000n) / weight) / 1_000 : 0
  return {
    label: "Optimal veMEZO",
    value: optimal !== undefined ? formatWhole(optimal) : "—",
    side:
      over > 0n
        ? { text: `+${formatWhole(over)} over`, tone: "neg" }
        : shortfall > 0n
          ? { text: `${formatWhole(shortfall)} to 5x`, tone: "muted" }
          : null,
    multiplier: {
      text: atMax ? "5×" : `${Math.floor(tenths / 10)}.${tenths % 10}×`,
      atMax,
    },
    meter: atMax
      ? { fill: 1 - overFraction, tone: "pos", over: overFraction }
      : { fill, tone: "accent", over: 0 },
  }
}

export function shareFooter(weight: bigint, total: bigint): TargetFooter {
  const share = Number(shareBps(weight, total)) / 10_000
  return {
    label: "Vote share",
    value: formatShare(weight, total),
    side: null,
    multiplier: null,
    meter: { fill: share, tone: "accent", over: 0 },
  }
}
