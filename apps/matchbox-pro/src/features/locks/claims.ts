import {
  type ClaimSource,
  type ClaimSourceKind,
  type TokenTotal,
  sumTokens,
} from "@/features/rewards/claimSources"
import type { ClaimableRow } from "@/hooks/useClaimable"
import type { Address } from "viem"
import type { LockKind } from "./lockModel"

// The Overview breakdown of the Rewards claim sources (one per voter and
// lock): veMEZO bribes on boost (veBTC) gauges, veBTC pool fees and bribes,
// veBTC validator bribes. Only groups with something claimable appear.
export type ClaimGroupId = "vebtc-gauges" | "pools" | "validators"

const GROUP_OF: Record<ClaimSourceKind, ClaimGroupId> = {
  "boost-bribes": "vebtc-gauges",
  "pool-rewards": "pools",
  "validator-bribes": "validators",
}

const GROUP_ORDER: ClaimGroupId[] = ["vebtc-gauges", "pools", "validators"]

const GROUP_LABEL: Record<ClaimGroupId, string> = {
  "vebtc-gauges": "veBTC",
  pools: "Pools",
  validators: "Validators",
}

export type ClaimRow = {
  key: string
  label: string
  tokens: TokenTotal[]
}

export type ClaimGroup = {
  id: ClaimGroupId
  label: string
  /** Priced total, micro-USD. */
  usdMicro: bigint
  unpriced: boolean
  rows: ClaimRow[]
}

function pricedTotal(tokens: TokenTotal[]): bigint {
  return tokens.reduce((sum, token) => sum + (token.usdMicro ?? 0n), 0n)
}

/**
 * Groups claim sources for the hero accordion. Boost bribes break down per
 * gauge (by profile name, from the per-bribe reads); pool and validator
 * sources break down per lock, the granularity their claims have.
 */
export function claimGroups(
  sources: ClaimSource[],
  boostRows: ClaimableRow[],
  gaugeName: (gauge: Address) => string,
): ClaimGroup[] {
  return GROUP_ORDER.flatMap((id) => {
    const members = sources.filter((source) => GROUP_OF[source.kind] === id)
    if (members.length === 0) return []
    const tokens = sumTokens(members.map((source) => source.tokens))
    const rows =
      id === "vebtc-gauges"
        ? gaugeRows(boostRows, gaugeName)
        : members.map((source) => ({
            key: source.key,
            label: `${source.escrow} #${source.tokenId}`,
            tokens: source.tokens,
          }))
    return [
      {
        id,
        label: GROUP_LABEL[id],
        usdMicro: pricedTotal(tokens),
        unpriced: tokens.some((token) => token.usdMicro === null),
        rows,
      },
    ]
  })
}

function gaugeRows(
  rows: ClaimableRow[],
  gaugeName: (gauge: Address) => string,
): ClaimRow[] {
  const byGauge = new Map<string, { gauge: Address; tokens: TokenTotal[] }>()
  for (const row of rows) {
    const key = row.gaugeAddress.toLowerCase()
    const tokens = row.rewards
      .filter((reward) => reward.earned > 0n)
      .map((reward) => ({
        token: reward.tokenAddress,
        symbol: reward.symbol,
        decimals: reward.decimals,
        amount: reward.earned,
        usdMicro: reward.priceAvailable ? reward.usdMicro : null,
      }))
    byGauge.set(key, {
      gauge: row.gaugeAddress,
      tokens: sumTokens([byGauge.get(key)?.tokens ?? [], tokens]),
    })
  }
  return [...byGauge.values()]
    .filter((entry) => entry.tokens.length > 0)
    .sort((a, b) => {
      const left = pricedTotal(a.tokens)
      const right = pricedTotal(b.tokens)
      return left === right ? 0 : left > right ? -1 : 1
    })
    .map((entry) => ({
      key: `gauge:${entry.gauge.toLowerCase()}`,
      label: gaugeName(entry.gauge),
      tokens: entry.tokens,
    }))
}

/** The claim sources one lock signs for. */
export function sourcesForLock(
  sources: ClaimSource[],
  lock: { kind: LockKind; tokenId: bigint },
): ClaimSource[] {
  return sources.filter(
    (source) => source.escrow === lock.kind && source.tokenId === lock.tokenId,
  )
}
