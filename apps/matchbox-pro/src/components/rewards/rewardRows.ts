import type { ClaimableRow } from "@/hooks/useClaimable"
import { profileForGauge } from "@/hooks/useProfiles"
import { formatTokenAmountDigits } from "@/lib/money"
import type { GaugeProfile } from "@/lib/supabase"
import type { Address } from "viem"

/** One unclaimed bribe contract for one veMEZO lock. */
export type RewardSource = {
  key: string
  tokenId: bigint
  gauge: Address
  bribe: Address
  name: string
  rewards: ClaimableRow["rewards"]
  usdMicro: bigint
  unpriced: number
}

/** One unclaimed token balance, as listed in the ledger table. */
export type RewardRow = ClaimableRow["rewards"][number] & {
  key: string
  tokenId: bigint
  gauge: Address
  name: string
}

export function buildRewardSources(
  rows: ClaimableRow[],
  profiles: GaugeProfile[] | undefined,
): RewardSource[] {
  return rows
    .map((row) => ({
      key: `${row.tokenId}:${row.bribeAddress}`,
      tokenId: row.tokenId,
      gauge: row.gaugeAddress,
      bribe: row.bribeAddress,
      name:
        profileForGauge(profiles, row.gaugeAddress)?.display_name ||
        `${row.gaugeAddress.slice(0, 6)}…${row.gaugeAddress.slice(-4)}`,
      rewards: row.rewards,
      usdMicro: row.rewards.reduce(
        (total, reward) =>
          reward.priceAvailable ? total + reward.usdMicro : total,
        0n,
      ),
      unpriced: row.rewards.filter((reward) => !reward.priceAvailable).length,
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

export function flattenRewardRows(sources: RewardSource[]): RewardRow[] {
  return sources.flatMap((source) =>
    source.rewards.map((reward) => ({
      ...reward,
      key: `${source.key}:${reward.tokenAddress}`,
      tokenId: source.tokenId,
      gauge: source.gauge,
      name: source.name,
    })),
  )
}

/** "804.40 MEZO · 18.06 mUSD": per-token sums across every source, bigint throughout. */
export function formatNativeTotals(rows: RewardRow[], digits = 2): string {
  const totals = new Map<
    string,
    { symbol: string; decimals: number; amount: bigint }
  >()
  for (const row of rows) {
    const key = row.tokenAddress.toLowerCase()
    const current = totals.get(key)
    totals.set(key, {
      symbol: row.symbol,
      decimals: row.decimals,
      amount: (current?.amount ?? 0n) + row.earned,
    })
  }
  return Array.from(totals.values())
    .map(
      (total) =>
        `${formatTokenAmountDigits(total.amount, total.decimals, digits)} ${total.symbol}`,
    )
    .join(" · ")
}
