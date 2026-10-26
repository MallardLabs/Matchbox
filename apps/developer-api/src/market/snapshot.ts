import {
  type Gauge,
  type GaugeIncentives,
  type Reward,
  type VoterKind,
  type VoterTotalWeights,
  voterEscrow,
} from "@repo/platform-contracts/market"
import type { NetworkSlug } from "@repo/platform-contracts/network"
import { aprPercent, boostMultiplier, sumUsd, tokenUsd } from "./money"
import { type ReferencePrices, tokenPrice } from "./prices"
import type { ChainGauge, ChainReward, MarketRead, TokenMeta } from "./reader"

/** An epoch's header: block, time and prices of the snapshot that wrote it. */
export type StoredEpoch = {
  network: NetworkSlug
  epochStart: number
  blockNumber: string
  asOf: string
  totalWeights: VoterTotalWeights
  prices: ReferencePrices
}

/** One gauge's state and rewards in one epoch. */
export type StoredGauge = {
  gauge: Gauge
  incentives: GaugeIncentives
}

export type EpochSnapshot = {
  epoch: StoredEpoch
  /**
   * The current epoch carries every gauge; later epochs only gauges with
   * rewards already deposited for them. Gauges missing here keep their
   * stored row (gauges are never removed from a voter).
   */
  gauges: StoredGauge[]
}

export type MarketSnapshot = {
  network: NetworkSlug
  epochs: EpochSnapshot[]
}

const unknownToken: TokenMeta = { symbol: null, decimals: null }

function decimalOrNull(value: bigint | null): string | null {
  return value === null ? null : value.toString()
}

function totalWeightsOf(read: MarketRead): VoterTotalWeights {
  return {
    boost: decimalOrNull(read.totalWeights.boost),
    pools: decimalOrNull(read.totalWeights.pools),
    validators: decimalOrNull(read.totalWeights.validators),
    "third-party": decimalOrNull(read.totalWeights["third-party"]),
  }
}

/** USD price of the token a voter's voting power is locked in. */
function votingTokenUsd(
  voter: VoterKind,
  prices: ReferencePrices,
): string | null {
  const price = voterEscrow[voter] === "veMEZO" ? prices.mezoUsd : prices.btcUsd
  return price?.usd ?? null
}

/** The reward paid for epoch `index`, or null when nothing (or unknown). */
function rewardAt(
  reward: ChainReward,
  index: number,
  tokens: ReadonlyMap<string, TokenMeta>,
  prices: ReferencePrices,
): Reward | null {
  const amount = reward.amounts[index] ?? null
  if (amount === null || amount === 0n) return null
  const meta = tokens.get(reward.token) ?? unknownToken
  const price = tokenPrice(reward.token, prices)
  const usd =
    price === null || meta.decimals === null
      ? null
      : tokenUsd(amount, meta.decimals, price.usd)
  return {
    kind: reward.kind,
    contract: reward.contract,
    token: reward.token,
    symbol: meta.symbol,
    decimals: meta.decimals,
    amount: amount.toString(),
    usd,
  }
}

export function incentivesFor(input: {
  network: NetworkSlug
  chain: ChainGauge
  epochStart: number
  epochIndex: number
  tokens: ReadonlyMap<string, TokenMeta>
  prices: ReferencePrices
}): GaugeIncentives {
  const { chain, prices } = input
  const voter = chain.link.voter
  const rewards = chain.rewards.flatMap((reward) => {
    const paid = rewardAt(reward, input.epochIndex, input.tokens, prices)
    return paid === null ? [] : [paid]
  })
  const priced = rewards.flatMap((reward) =>
    reward.usd === null ? [] : [reward.usd],
  )
  const totalUsd = priced.length === 0 ? null : sumUsd(priced)
  const tokenUsdPrice = votingTokenUsd(voter, prices)
  return {
    network: input.network,
    voter,
    gaugeAddress: chain.gaugeAddress,
    epochStart: input.epochStart,
    isAlive: chain.isAlive,
    weight: decimalOrNull(chain.weight),
    rewards,
    totalUsd,
    unpricedRewards: rewards.length - priced.length,
    aprPercent:
      totalUsd === null || chain.weight === null || tokenUsdPrice === null
        ? null
        : aprPercent({
            totalUsd,
            weight: chain.weight,
            votingTokenUsd: tokenUsdPrice,
          }),
  }
}

export function gaugeFrom(network: NetworkSlug, chain: ChainGauge): Gauge {
  const base = {
    network,
    gaugeAddress: chain.gaugeAddress,
    isAlive: chain.isAlive,
    weight: decimalOrNull(chain.weight),
    bribeContract: chain.bribeContract,
  }
  const link = chain.link
  switch (link.voter) {
    case "boost":
      return {
        voter: "boost",
        ...base,
        vebtcTokenId: link.vebtcTokenId,
        beneficiary: link.beneficiary,
        boostMultiplier:
          link.boost === null ? null : boostMultiplier(link.boost),
      }
    case "pools":
      return {
        voter: "pools",
        ...base,
        poolAddress: link.poolAddress,
        poolSymbol: link.poolSymbol,
        feesContract: link.feesContract,
      }
    case "validators":
      return {
        voter: "validators",
        ...base,
        operatorAddress: link.operatorAddress,
        moniker: link.moniker,
      }
    case "third-party":
      return { voter: "third-party", ...base }
  }
}

/**
 * Turns one chain read into per-epoch rows. `read.epochStarts[0]` is the
 * current epoch; later entries are upcoming epochs with rewards deposited
 * ahead of time.
 */
export function buildSnapshot(
  read: MarketRead,
  prices: ReferencePrices,
  takenAt: Date,
): MarketSnapshot {
  const totalWeights = totalWeightsOf(read)
  const epochs = read.epochStarts.map(
    function epochSnapshot(epochStart, epochIndex): EpochSnapshot {
      const gauges = read.gauges.flatMap((chain): StoredGauge[] => {
        const incentives = incentivesFor({
          network: read.network,
          chain,
          epochStart,
          epochIndex,
          tokens: read.tokens,
          prices,
        })
        if (epochIndex > 0 && incentives.rewards.length === 0) return []
        return [{ gauge: gaugeFrom(read.network, chain), incentives }]
      })
      return {
        epoch: {
          network: read.network,
          epochStart,
          blockNumber: read.blockNumber.toString(),
          asOf: takenAt.toISOString(),
          totalWeights,
          prices,
        },
        gauges,
      }
    },
  )
  return { network: read.network, epochs }
}
