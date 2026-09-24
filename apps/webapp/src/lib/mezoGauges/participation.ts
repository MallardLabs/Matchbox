export type ThirdPartyVote = {
  tokenId: bigint
  owner: string
  gauge: string
  currentWeight: bigint
}

export type WalletWeight = {
  owner: string
  weight: bigint
  shareBps: bigint
  gauges: string[]
}

export type AggregatedVotes = {
  totalWeight: bigint
  votingNfts: number
  wallets: number
  byWallet: WalletWeight[]
  topWalletBps: bigint
  gaugeWeights: Map<string, bigint>
}

const BPS_DENOMINATOR = 10_000n

/** Basis points (2dp percent: 3041 → "30.41%"). 0n when supply is zero. */
export function participationBps(
  totalWeight: bigint,
  totalVotingPower: bigint,
): bigint {
  if (totalVotingPower <= 0n) return 0n
  return (totalWeight * BPS_DENOMINATOR) / totalVotingPower
}

export function shareBps(part: bigint, total: bigint): bigint {
  if (total <= 0n) return 0n
  return (part * BPS_DENOMINATOR) / total
}

/** "3041" → "30.41%"; "253" → "2.53%"; "7" → "0.07%". */
export function formatBps(bps: bigint): string {
  const whole = bps / 100n
  const frac = (bps % 100n).toString().padStart(2, "0")
  return `${whole}.${frac}%`
}

export function aggregateVotes(votes: ThirdPartyVote[]): AggregatedVotes {
  let totalWeight = 0n
  const tokenIds = new Set<string>()
  const owners = new Set<string>()
  const gaugeWeights = new Map<string, bigint>()
  const walletMap = new Map<string, { weight: bigint; gauges: Set<string> }>()

  for (const vote of votes) {
    const owner = vote.owner.toLowerCase()
    const gauge = vote.gauge.toLowerCase()
    totalWeight += vote.currentWeight
    gaugeWeights.set(
      gauge,
      (gaugeWeights.get(gauge) ?? 0n) + vote.currentWeight,
    )
    if (vote.currentWeight <= 0n) continue
    tokenIds.add(vote.tokenId.toString())
    owners.add(owner)

    const entry = walletMap.get(owner) ?? { weight: 0n, gauges: new Set() }
    entry.weight += vote.currentWeight
    entry.gauges.add(gauge)
    walletMap.set(owner, entry)
  }

  const byWallet: WalletWeight[] = [...walletMap.entries()]
    .map(([owner, entry]) => ({
      owner,
      weight: entry.weight,
      shareBps: shareBps(entry.weight, totalWeight),
      gauges: [...entry.gauges].sort(),
    }))
    .sort((a, b) => (a.weight === b.weight ? 0 : a.weight > b.weight ? -1 : 1))

  return {
    totalWeight,
    votingNfts: tokenIds.size,
    wallets: owners.size,
    byWallet,
    topWalletBps: byWallet[0]?.shareBps ?? 0n,
    gaugeWeights,
  }
}
