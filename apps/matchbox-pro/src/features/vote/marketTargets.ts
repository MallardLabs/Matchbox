import { shortenAddress } from "@repo/ui/wallet-address"
import type { MarketRewardToken, PoolMarket, ValidatorMarket } from "./contract"
import { formatUsdHeadline } from "./format"
import type { VoteTarget } from "./model"
import {
  PER_VEBTC,
  type Prices,
  type UnpricedReward,
  formatShare,
  formatVeBtc,
  lineFooter,
  priceRewards,
  rewardPerUnit,
  shareBps,
  sumPriced,
} from "./targets"

export type ValidatorProfile = {
  gauge_address: string
  operator_address?: string | null | undefined
  display_name?: string | null | undefined
  description?: string | null | undefined
  profile_picture_url?: string | null | undefined
}

function unpriced(tokens: readonly MarketRewardToken[]): UnpricedReward[] {
  return tokens.map((token) => ({
    tokenAddress: token.tokenAddress,
    symbol: token.symbol,
    decimals: token.decimals,
    amount: token.epochAmount,
    priceUsd: token.priceUsd,
  }))
}

/** Validator gauges → cards. Supabase profile beats the registry moniker. */
export function validatorTargets(
  market: ValidatorMarket,
  profiles: readonly ValidatorProfile[],
  prices: Prices,
): VoteTarget[] {
  const profileByGauge = new Map(
    profiles.map((profile) => [profile.gauge_address.toLowerCase(), profile]),
  )
  return market.gauges.map((row): VoteTarget => {
    const profile = profileByGauge.get(row.gauge.toLowerCase())
    const operator = row.operator
    const name =
      profile?.display_name?.trim() ||
      row.moniker ||
      shortenAddress(operator ?? row.gauge)
    const rewards = priceRewards(unpriced(row.rewardTokens), prices)
    const { microUsd, hasUnpriced } = sumPriced(rewards)
    return {
      id: row.gauge,
      name,
      description: profile?.description?.trim() || row.details || null,
      mark: profile?.profile_picture_url
        ? { kind: "image", url: profile.profile_picture_url }
        : { kind: "monogram", name, seed: row.gauge },
      chip: null,
      isAlive: row.isAlive,
      needsBoost: false,
      totalWeight: row.weight,
      rewards,
      incentiveMicroUsd: microUsd,
      hasUnpriced,
      rewardsLabel: "Incentives",
      apyBps: null,
      perUnitMicroUsd:
        microUsd > 0n ? rewardPerUnit(microUsd, row.weight, PER_VEBTC) : null,
      stats: [
        { label: "Votes", value: formatVeBtc(row.weight) },
        { label: "Share", value: formatShare(row.weight, market.totalWeight) },
      ],
      footer: lineFooter(
        operator
          ? `Operator ${shortenAddress(operator)}`
          : "Not in the validator set",
        row.weight,
        market.totalWeight,
      ),
      sortValues: {
        incentives: microUsd,
        votes: row.weight,
        share: shareBps(row.weight, market.totalWeight),
      },
      searchText: [name, row.moniker, operator ?? "", row.gauge]
        .join(" ")
        .toLowerCase(),
      hasDetail: false,
    }
  })
}

/** Footer money in the same format as the card's headline total. */
function rewardTotal(rewards: ReturnType<typeof priceRewards>): string {
  const { microUsd, hasUnpriced } = sumPriced(rewards)
  if (hasUnpriced && microUsd === 0n) return "Unpriced"
  return formatUsdHeadline(microUsd)
}

/**
 * PoolsVoter targets → cards. Voters earn the gauge's fee reward (last
 * epoch's trading fees) plus bribes; both count toward the headline total,
 * which is labelled as such, and toward APY.
 */
export function poolTargets(market: PoolMarket, prices: Prices): VoteTarget[] {
  return market.targets.map((row): VoteTarget => {
    const pair =
      row.kind === "pool" && row.tokens.length === 2 ? row.tokens : null
    const name = pair
      ? `${pair[0]?.symbol} / ${pair[1]?.symbol}`
      : (row.name ?? row.symbol ?? shortenAddress(row.target))
    const fees = priceRewards(unpriced(row.fees), prices)
    const bribes = priceRewards(unpriced(row.bribes), prices)
    const rewards = [...fees, ...bribes]
    const { microUsd, hasUnpriced } = sumPriced(rewards)
    return {
      id: row.target,
      name,
      description: pair ? row.symbol : `Vault · ${row.symbol ?? "—"}`,
      mark: pair
        ? { kind: "pair", tokens: pair }
        : { kind: "monogram", name, seed: row.target },
      chip: null,
      isAlive: row.isAlive,
      needsBoost: false,
      totalWeight: row.weight,
      rewards,
      incentiveMicroUsd: microUsd,
      hasUnpriced,
      rewardsLabel: "Fees + incentives",
      apyBps: null,
      perUnitMicroUsd:
        microUsd > 0n ? rewardPerUnit(microUsd, row.weight, PER_VEBTC) : null,
      stats: [
        { label: "Votes", value: formatVeBtc(row.weight) },
        { label: "Share", value: formatShare(row.weight, market.totalWeight) },
      ],
      // The headline is fees + incentives; this line is the split.
      footer: lineFooter(
        `Fees ${rewardTotal(fees)} · Incentives ${rewardTotal(bribes)}`,
        row.weight,
        market.totalWeight,
      ),
      sortValues: {
        incentives: microUsd,
        votes: row.weight,
        share: shareBps(row.weight, market.totalWeight),
      },
      searchText: [
        name,
        row.symbol ?? "",
        row.name ?? "",
        row.target,
        row.gauge,
      ]
        .join(" ")
        .toLowerCase(),
      hasDetail: false,
    }
  })
}
