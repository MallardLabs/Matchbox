import type { ClaimableRow } from "@/hooks/useClaimable"
import type { Address } from "viem"

// One claim source = one wallet signature: a voter contract's claim call for
// one lock. veMEZO boost bribes go through BoostVoter.claimBribes, veBTC pool
// fees and bribes through PoolsVoter.claimFeesAndBribes, and veBTC validator
// bribes through ValidatorsVoter.claimBribes.
export type ClaimSourceKind =
  | "boost-bribes"
  | "pool-rewards"
  | "validator-bribes"

export type Escrow = "veMEZO" | "veBTC"

export type TokenTotal = {
  token: Address
  symbol: string
  decimals: number
  amount: bigint
  /** Null when the token has no reference price (shown as "Unpriced"). */
  usdMicro: bigint | null
}

export type ClaimSource = {
  key: string
  kind: ClaimSourceKind
  escrow: Escrow
  tokenId: bigint
  /** Reward contracts the claim call touches. */
  rewardContracts: Address[]
  /** Reward tokens per contract, aligned with `rewardContracts`. */
  rewardTokens: Address[][]
  /** Distinct gauges (pools, validators) behind the reward contracts. */
  gauges: number
  tokens: TokenTotal[]
  /** Sum of priced tokens only. */
  usdMicro: bigint
  unpriced: number
}

/** One reward contract's unclaimed tokens for one lock. */
export type RewardRow = {
  kind: ClaimSourceKind
  tokenId: bigint
  gauge: Address
  rewardContract: Address
  tokens: TokenTotal[]
}

const KIND_ORDER: Record<ClaimSourceKind, number> = {
  "boost-bribes": 0,
  "pool-rewards": 1,
  "validator-bribes": 2,
}

const KIND_ESCROW: Record<ClaimSourceKind, Escrow> = {
  "boost-bribes": "veMEZO",
  "pool-rewards": "veBTC",
  "validator-bribes": "veBTC",
}

const KIND_LABEL: Record<ClaimSourceKind, { full: string; short: string }> = {
  "boost-bribes": { full: "Boost-gauge bribes", short: "Boost bribes" },
  "pool-rewards": { full: "Pool voter fees", short: "Pool fees" },
  "validator-bribes": { full: "Validator bribes", short: "Validator bribes" },
}

const KIND_META: Record<
  ClaimSourceKind,
  { contract: string; one: string; many: string }
> = {
  "boost-bribes": {
    contract: "BribeVotingReward",
    one: "gauge",
    many: "gauges",
  },
  "pool-rewards": { contract: "Fees and bribes", one: "pool", many: "pools" },
  "validator-bribes": {
    contract: "BribeVotingReward",
    one: "validator",
    many: "validators",
  },
}

/** Groups reward rows into one source per (voter, lock), skipping empty ones. */
export function buildSources(rows: RewardRow[]): ClaimSource[] {
  const groups = new Map<string, { source: ClaimSource; gauges: Set<string> }>()
  for (const row of rows) {
    const tokens = row.tokens.filter((token) => token.amount > 0n)
    if (tokens.length === 0) continue
    const key = `${row.kind}:${row.tokenId}`
    const group = groups.get(key) ?? {
      source: {
        key,
        kind: row.kind,
        escrow: KIND_ESCROW[row.kind],
        tokenId: row.tokenId,
        rewardContracts: [],
        rewardTokens: [],
        gauges: 0,
        tokens: [],
        usdMicro: 0n,
        unpriced: 0,
      },
      gauges: new Set<string>(),
    }
    group.source.rewardContracts.push(row.rewardContract)
    group.source.rewardTokens.push(tokens.map((token) => token.token))
    group.source.tokens = sumTokens([group.source.tokens, tokens])
    group.gauges.add(row.gauge.toLowerCase())
    groups.set(key, group)
  }
  return sortSources(
    Array.from(groups.values()).map(({ source, gauges }) => ({
      ...source,
      gauges: gauges.size,
      usdMicro: pricedUsd(source.tokens),
      unpriced: source.tokens.filter((token) => token.usdMicro === null).length,
    })),
  )
}

/** veMEZO boost bribes from `useClaimable`, one source per lock. */
export function buildBoostSources(rows: ClaimableRow[]): ClaimSource[] {
  return buildSources(
    rows.map((row) => ({
      kind: "boost-bribes",
      tokenId: row.tokenId,
      gauge: row.gaugeAddress,
      rewardContract: row.bribeAddress,
      tokens: row.rewards.map((reward) => ({
        token: reward.tokenAddress,
        symbol: reward.symbol,
        decimals: reward.decimals,
        amount: reward.earned,
        usdMicro: reward.priceAvailable ? reward.usdMicro : null,
      })),
    })),
  )
}

export function sortSources(sources: ClaimSource[]): ClaimSource[] {
  return [...sources].sort((a, b) => {
    const kind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    if (kind !== 0) return kind
    if (a.tokenId === b.tokenId) return 0
    return a.tokenId < b.tokenId ? -1 : 1
  })
}

/**
 * Merges token amounts by address, largest USD value first (unpriced last);
 * USD stays null if any part is unpriced.
 */
export function sumTokens(groups: TokenTotal[][]): TokenTotal[] {
  const totals = new Map<string, TokenTotal>()
  for (const token of groups.flat()) {
    const key = token.token.toLowerCase()
    const current = totals.get(key)
    if (!current) {
      totals.set(key, { ...token })
      continue
    }
    current.amount += token.amount
    current.usdMicro =
      current.usdMicro === null || token.usdMicro === null
        ? null
        : current.usdMicro + token.usdMicro
  }
  return Array.from(totals.values()).sort((a, b) => {
    const left = a.usdMicro ?? -1n
    const right = b.usdMicro ?? -1n
    return left === right ? 0 : left > right ? -1 : 1
  })
}

export function pricedUsd(tokens: TokenTotal[]): bigint {
  return tokens.reduce((sum, token) => sum + (token.usdMicro ?? 0n), 0n)
}

export function sourceTokens(sources: ClaimSource[]): TokenTotal[] {
  return sumTokens(sources.map((source) => source.tokens))
}

const KIND_GROUP: Record<ClaimSourceKind, string> = {
  "boost-bribes": "veBTC gauges",
  "pool-rewards": "Pools",
  "validator-bribes": "Validators",
}

/** Family heading for grouped breakdowns (J03: veBTC gauges · Pools · Validators). */
export function sourceGroupLabel(kind: ClaimSourceKind): string {
  return KIND_GROUP[kind]
}

export function sourceLabel(source: ClaimSource): string {
  return `${KIND_LABEL[source.kind].full} · ${source.escrow} #${source.tokenId}`
}

export function sourceShortLabel(source: ClaimSource): string {
  return `${KIND_LABEL[source.kind].short} · #${source.tokenId}`
}

export function sourceMeta(source: ClaimSource): string {
  const meta = KIND_META[source.kind]
  return `${meta.contract} · ${source.gauges} ${source.gauges === 1 ? meta.one : meta.many}`
}

function groupThousands(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/**
 * Native amount for display: two decimals at or above one unit, otherwise
 * enough decimals to show two significant digits ("0.012", "0.00064").
 * Truncates, never rounds up.
 */
export function formatNative(amount: bigint, decimals: number): string {
  if (amount === 0n) return "0"
  const negative = amount < 0n
  const value = negative ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = value % base
  let digits = 2
  if (whole === 0n && decimals > 0) {
    const padded = fraction.toString().padStart(decimals, "0")
    const firstSignificant = padded.search(/[1-9]/)
    digits = Math.min(decimals, Math.max(2, firstSignificant + 2))
  }
  digits = Math.min(digits, decimals)
  const shown =
    digits === 0
      ? ""
      : `.${((fraction * 10n ** BigInt(digits)) / base)
          .toString()
          .padStart(digits, "0")}`
  const text =
    whole === 0n && digits > 2 ? shown.replace(/0+$/, "") : `${shown}`
  return `${negative ? "-" : ""}${groupThousands(whole)}${text}`
}

export function formatTokenList(tokens: TokenTotal[]): string {
  return tokens
    .filter((token) => token.amount > 0n)
    .map(
      (token) =>
        `${formatNative(token.amount, token.decimals)} ${token.symbol}`,
    )
    .join(" · ")
}

/** "3 independent signatures · not atomic · est. gas 0.00064 BTC". */
export function signatureNote(
  count: number,
  gasWei: bigint | null,
): string | null {
  if (count === 0) return null
  const parts =
    count === 1
      ? ["1 signature"]
      : [`${count} independent signatures`, "not atomic"]
  if (gasWei !== null && gasWei > 0n) {
    parts.push(`est. gas ${formatNative(gasWei, 18)} BTC`)
  }
  return parts.join(" · ")
}
