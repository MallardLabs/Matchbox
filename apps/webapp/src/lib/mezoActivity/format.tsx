import type { GaugeProfile } from "@/config/supabase"
import type { Pool } from "@/hooks/usePools"
import { MEZO_BOOST_POKE_CRON_ADDRESS } from "@/lib/mezoActivity/constants"
import type {
  MezoActivityActionType,
  MezoActivityItem,
} from "@/types/mezoActivity"
import { type Address, getAddress, isAddressEqual } from "viem"

export type EnrichmentContext = {
  poolsByGauge: Map<string, Pool>
  gaugeProfilesByAddress: Map<string, GaugeProfile>
  boostableGauges: Map<string, Address>
  mezoPriceUsd: number | null
  btcPriceUsd: number | null
}

export type DrawerField = {
  label: string
  value: string
  mono?: boolean
  href?: string
}

export type ActivityFormat = {
  category: ActivityCategory
  emoji: string
  title: string
  subtitle?: string | undefined
  amount?: string | undefined
  amountSubtext?: string | undefined
  where?:
    | {
        label: string
        sub?: string | undefined
        imageUrl?: string | undefined
        href?: string | undefined
      }
    | undefined
  drawer: DrawerField[]
}

export type ActivityCategory =
  | "lock"
  | "vote"
  | "boost"
  | "incentive"
  | "reward"
  | "automated"
  | "protocol"
  | "lifecycle"

const TIGRIS_MAINTAINER_LABEL = "Tigris maintainer (cron)"

function shortenAddress(value: string | undefined): string {
  if (!value) return "—"
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function isCronActor(item: MezoActivityItem): boolean {
  if (!item.txFrom) return false
  try {
    return isAddressEqual(getAddress(item.txFrom), MEZO_BOOST_POKE_CRON_ADDRESS)
  } catch {
    return false
  }
}

function labelActor(item: MezoActivityItem): string {
  if (isCronActor(item)) return TIGRIS_MAINTAINER_LABEL
  const addr = item.actorAddress ?? item.txFrom
  return shortenAddress(addr)
}

function formatTokenAmount(
  raw: bigint | undefined,
  decimals = 18,
  fractionDigits = 4,
): string | undefined {
  if (raw === undefined) return undefined
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const fractionRaw = raw - whole * divisor
  if (fractionRaw === 0n) {
    return whole.toString()
  }
  const fractionStr = fractionRaw
    .toString()
    .padStart(decimals, "0")
    .slice(0, fractionDigits)
    .replace(/0+$/, "")
  if (!fractionStr) return whole.toString()
  return `${whole.toString()}.${fractionStr}`
}

function formatCompactAmount(value: bigint | undefined, decimals = 18): string {
  if (value === undefined) return "—"
  const asNumber = Number(value) / 10 ** decimals
  if (!Number.isFinite(asNumber)) return value.toString()
  if (asNumber === 0) return "0"
  if (asNumber >= 1_000_000) return `${(asNumber / 1_000_000).toFixed(2)}M`
  if (asNumber >= 1_000) return `${(asNumber / 1_000).toFixed(2)}K`
  if (asNumber >= 1) return asNumber.toFixed(2)
  return asNumber.toFixed(4)
}

function formatBoost(value: bigint | undefined): string {
  if (value === undefined) return "—"
  const multiplier = Number(value) / 1e18
  if (!Number.isFinite(multiplier)) return value.toString()
  return `${multiplier.toFixed(2)}×`
}

function formatUsd(amount: number): string {
  if (amount >= 1_000_000) return `≈ $${(amount / 1_000_000).toFixed(2)}M`
  if (amount >= 1_000) return `≈ $${(amount / 1_000).toFixed(2)}K`
  if (amount >= 1) return `≈ $${amount.toFixed(2)}`
  return `≈ $${amount.toFixed(4)}`
}

function formatTimestampHuman(timestamp: number): string {
  const iso = new Date(timestamp * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19)
  return `${iso} UTC`
}

function formatLockDuration(seconds: bigint): string {
  const total = Number(seconds)
  if (!Number.isFinite(total) || total <= 0) return "—"
  const years = Math.floor(total / (365 * 86_400))
  const remainingAfterYears = total - years * 365 * 86_400
  const months = Math.floor(remainingAfterYears / (30 * 86_400))
  const remainingAfterMonths = remainingAfterYears - months * 30 * 86_400
  const days = Math.floor(remainingAfterMonths / 86_400)
  const parts: string[] = []
  if (years) parts.push(`${years}y`)
  if (months) parts.push(`${months}mo`)
  if (!years && !months && days) parts.push(`${days}d`)
  return parts.join(" ") || "<1d"
}

function poolKey(address: Address | string | undefined): string | undefined {
  if (!address) return undefined
  try {
    return getAddress(address).toLowerCase()
  } catch {
    return address.toLowerCase()
  }
}

function lookupPool(
  ctx: EnrichmentContext,
  gauge: Address | string | undefined,
): Pool | undefined {
  const key = poolKey(gauge)
  return key ? ctx.poolsByGauge.get(key) : undefined
}

function lookupGaugeProfile(
  ctx: EnrichmentContext,
  gauge: Address | string | undefined,
): GaugeProfile | undefined {
  const key = poolKey(gauge)
  return key ? ctx.gaugeProfilesByAddress.get(key) : undefined
}

function poolLabel(pool: Pool | undefined): string | undefined {
  if (!pool) return undefined
  const pair = `${pool.token0.symbol}/${pool.token1.symbol}`
  const kind = pool.volatility === "stable" ? "Stable" : "Volatile"
  return `${pair} (${kind})`
}

function gaugeWhere(
  ctx: EnrichmentContext,
  gauge: Address | string | undefined,
): ActivityFormat["where"] {
  if (!gauge) return undefined
  const profile = lookupGaugeProfile(ctx, gauge)
  const pool = lookupPool(ctx, gauge)
  const pairLabel = poolLabel(pool)
  const display =
    profile?.display_name?.trim() || pairLabel || shortenAddress(gauge)
  const sub = profile?.display_name && pairLabel ? pairLabel : undefined
  const where: ActivityFormat["where"] = {
    label: display,
    href: `/gauges/${gauge}`,
  }
  if (sub) where.sub = sub
  if (profile?.profile_picture_url) {
    where.imageUrl = profile.profile_picture_url
  }
  return where
}

function votePercent(weight?: bigint, total?: bigint): string | undefined {
  if (!weight || !total || total === 0n) return undefined
  const pct = (Number(weight) / Number(total)) * 100
  if (!Number.isFinite(pct)) return undefined
  if (pct >= 100) return "100%"
  if (pct >= 1) return `${pct.toFixed(1)}%`
  return `${pct.toFixed(3)}%`
}

function explorerUrl(item: MezoActivityItem): string | undefined {
  if (item.explorerUrl) return item.explorerUrl
  if (item.txHash) return `https://explorer.mezo.org/tx/${item.txHash}`
  return undefined
}

function baseDrawer(item: MezoActivityItem): DrawerField[] {
  const fields: DrawerField[] = []
  if (item.txHash) {
    const url = explorerUrl(item)
    fields.push({
      label: "Transaction",
      value: shortenAddress(item.txHash),
      mono: true,
      ...(url ? { href: url } : {}),
    })
  }
  fields.push({
    label: "Block",
    value: item.blockNumber.toString(),
    mono: true,
  })
  fields.push({
    label: "Timestamp",
    value: formatTimestampHuman(item.timestamp),
  })
  if (item.txFrom) {
    fields.push({
      label: "Tx From",
      value: isCronActor(item)
        ? `${TIGRIS_MAINTAINER_LABEL} (${shortenAddress(item.txFrom)})`
        : shortenAddress(item.txFrom),
      mono: true,
    })
  }
  return fields
}

function voterDisplayName(contract?: string): string {
  if (contract === "thirdPartyVoter") return "Third-Party Voter"
  if (contract === "validatorsVoter") return "Validators Voter"
  if (contract === "poolsVoter") return "Pools Voter"
  if (contract === "boostVoter") return "Boost Voter"
  return "Voter"
}

function splitterDisplayName(contract?: string): string {
  if (contract === "chainFeeSplitter") return "Chain Fee Splitter"
  if (contract === "mezoChainSplitter") return "MEZO Chain Splitter"
  if (contract === "mezoEcosystemSplitter") return "MEZO Ecosystem Splitter"
  return "Splitter"
}

function boostablePokeWhere(
  ctx: EnrichmentContext,
  item: MezoActivityItem,
): ActivityFormat["where"] {
  if (!item.tokenId) return undefined
  const resolvedGauge = ctx.boostableGauges.get(item.tokenId.toString())
  return gaugeWhere(ctx, resolvedGauge)
}

const LOCK_DURATION_FALLBACK = 0n

export function formatActivity(
  item: MezoActivityItem,
  ctx: EnrichmentContext,
): ActivityFormat {
  const actor = labelActor(item)
  const drawer = baseDrawer(item)

  switch (item.actionType) {
    case "lockCreated":
    case "lockAmountIncreased": {
      const verb =
        item.actionType === "lockCreated" ? "Locked" : "Added to lock"
      const duration = item.duration ?? LOCK_DURATION_FALLBACK
      drawer.unshift(
        { label: "Owner", value: actor, mono: true },
        {
          label: "Amount",
          value: `${formatTokenAmount(item.amount) ?? "—"} MEZO`,
        },
        ...(item.duration
          ? [
              {
                label: "Lock duration",
                value: formatLockDuration(item.duration),
              },
            ]
          : []),
        ...(item.tokenId
          ? [
              {
                label: "veMEZO token",
                value: `#${item.tokenId.toString()}`,
                mono: true,
              },
            ]
          : []),
      )
      return {
        category: "lock",
        emoji: "🔒",
        title: `${verb} ${formatCompactAmount(item.amount)} MEZO → veMEZO${item.tokenId ? ` #${item.tokenId}` : ""}`,
        subtitle: `${actor}${duration ? ` · ${formatLockDuration(duration)} lock` : ""}`,
        amount: formatTokenAmount(item.amount),
        amountSubtext: "MEZO",
        drawer,
      }
    }

    case "lockExtended": {
      drawer.unshift(
        { label: "Owner", value: actor, mono: true },
        ...(item.tokenId
          ? [
              {
                label: "veMEZO token",
                value: `#${item.tokenId.toString()}`,
                mono: true,
              },
            ]
          : []),
        ...(item.duration
          ? [
              {
                label: "New duration",
                value: formatLockDuration(item.duration),
              },
            ]
          : []),
      )
      return {
        category: "lock",
        emoji: "⏱",
        title: `Extended veMEZO${item.tokenId ? ` #${item.tokenId}` : ""} lock`,
        subtitle: `${actor}${item.duration ? ` · new duration ${formatLockDuration(item.duration)}` : ""}`,
        drawer,
      }
    }

    case "lockWithdrawn":
    case "lockPermanentUnlocked": {
      drawer.unshift(
        { label: "Owner", value: actor, mono: true },
        ...(item.tokenId
          ? [
              {
                label: "veMEZO token",
                value: `#${item.tokenId.toString()}`,
                mono: true,
              },
            ]
          : []),
        ...(item.amount
          ? [
              {
                label: "Returned amount",
                value: `${formatTokenAmount(item.amount) ?? "—"} MEZO`,
              },
            ]
          : []),
      )
      return {
        category: "lock",
        emoji: "📤",
        title:
          item.actionType === "lockWithdrawn"
            ? `Withdrew ${formatCompactAmount(item.amount)} MEZO from veMEZO${item.tokenId ? ` #${item.tokenId}` : ""}`
            : `Unlocked permanent veMEZO${item.tokenId ? ` #${item.tokenId}` : ""}`,
        subtitle: actor,
        amount: formatTokenAmount(item.amount),
        amountSubtext: "MEZO",
        drawer,
      }
    }

    case "lockPermanent": {
      drawer.unshift(
        { label: "Owner", value: actor, mono: true },
        ...(item.tokenId
          ? [
              {
                label: "veMEZO token",
                value: `#${item.tokenId.toString()}`,
                mono: true,
              },
            ]
          : []),
      )
      return {
        category: "lock",
        emoji: "♾",
        title: `Made veMEZO${item.tokenId ? ` #${item.tokenId}` : ""} permanent`,
        subtitle: `${actor} · no decay`,
        drawer,
      }
    }

    case "boostVote": {
      const where = gaugeWhere(ctx, item.gaugeAddress)
      const pct = votePercent(item.weight, item.totalWeight)
      const weightLabel = item.weight
        ? `${formatCompactAmount(item.weight)} weight`
        : ""
      drawer.unshift(
        { label: "Voter", value: actor, mono: true },
        ...(item.tokenId
          ? [
              {
                label: "veMEZO token",
                value: `#${item.tokenId.toString()}`,
                mono: true,
              },
            ]
          : []),
        ...(item.gaugeAddress
          ? [
              {
                label: "Gauge",
                value: shortenAddress(item.gaugeAddress),
                mono: true,
                href: `/gauges/${item.gaugeAddress}`,
              },
            ]
          : []),
        ...(item.weight
          ? [
              {
                label: "Weight cast",
                value: formatTokenAmount(item.weight) ?? "—",
              },
            ]
          : []),
        ...(item.totalWeight
          ? [
              {
                label: "Total voter weight",
                value: formatTokenAmount(item.totalWeight) ?? "—",
              },
            ]
          : []),
        ...(pct ? [{ label: "% of voter power", value: pct }] : []),
      )
      const subjectLabel = where?.label ?? "gauge"
      const titleVerb =
        item.boostContext === "matchboxGaugeBoost"
          ? "Boosted"
          : item.boostContext === "mezoVeBtcPairBoost"
            ? "Boosted (Pair)"
            : "Voted on"
      const sub = [
        actor,
        weightLabel,
        pct ? `${pct} of voting power` : undefined,
      ]
        .filter(Boolean)
        .join(" · ")
      return {
        category: "vote",
        emoji: "🗳",
        title: `${titleVerb} ${subjectLabel}`,
        subtitle: sub,
        amount: weightLabel || undefined,
        ...(where ? { where } : {}),
        drawer,
      }
    }

    case "boostAbstain": {
      const where = gaugeWhere(ctx, item.gaugeAddress)
      drawer.unshift(
        { label: "Voter", value: actor, mono: true },
        ...(item.tokenId
          ? [
              {
                label: "veMEZO token",
                value: `#${item.tokenId.toString()}`,
                mono: true,
              },
            ]
          : []),
        ...(item.weight
          ? [
              {
                label: "Weight reset",
                value: formatTokenAmount(item.weight) ?? "—",
              },
            ]
          : []),
      )
      return {
        category: "vote",
        emoji: "↺",
        title: `Reset vote on ${where?.label ?? "gauge"}`,
        subtitle: `${actor}${item.tokenId ? ` · veMEZO #${item.tokenId}` : ""}`,
        ...(where ? { where } : {}),
        drawer,
      }
    }

    case "boostPoke": {
      const where = boostablePokeWhere(ctx, item)
      const automated = isCronActor(item) || item.pokeMethod === "pokeBoosts"
      const boostLabel = formatBoost(item.boost)
      const methodLabel =
        item.pokeMethod === "pokeBoosts"
          ? "pokeBoosts (batch)"
          : item.pokeMethod === "pokeBoost"
            ? "pokeBoost (single)"
            : item.pokeMethod === "poke"
              ? "poke (veMEZO snapshot)"
              : "boost refresh"
      drawer.unshift(
        ...(item.tokenId
          ? [
              {
                label: "Boostable token",
                value: `#${item.tokenId.toString()}`,
                mono: true,
              },
            ]
          : []),
        ...(item.boost ? [{ label: "New boost", value: boostLabel }] : []),
        { label: "Function called", value: methodLabel },
        ...(automated
          ? [{ label: "Caller", value: TIGRIS_MAINTAINER_LABEL }]
          : [{ label: "Caller", value: actor, mono: true }]),
      )
      return {
        category: automated ? "automated" : "boost",
        emoji: automated ? "🤖" : "⚡",
        title: automated
          ? `Refreshed boost on ${where?.label ?? "veBTC position"}`
          : `${actor} refreshed boost on ${where?.label ?? "veBTC position"}`,
        subtitle: automated
          ? `${TIGRIS_MAINTAINER_LABEL} · ${methodLabel}`
          : `${actor} · ${methodLabel}`,
        amount: item.boost ? boostLabel : undefined,
        amountSubtext: item.boost ? "boost" : undefined,
        ...(where ? { where } : {}),
        drawer,
      }
    }

    case "incentiveAdded": {
      const where = gaugeWhere(ctx, item.gaugeAddress)
      drawer.unshift(
        { label: "Sender", value: actor, mono: true },
        ...(item.gaugeAddress
          ? [
              {
                label: "Gauge",
                value: shortenAddress(item.gaugeAddress),
                mono: true,
              },
            ]
          : []),
        ...(item.amount
          ? [{ label: "Amount", value: formatTokenAmount(item.amount) ?? "—" }]
          : []),
      )
      return {
        category: "incentive",
        emoji: "🎁",
        title: `Added incentive to ${where?.label ?? "gauge"}`,
        subtitle: `${actor} · ${formatCompactAmount(item.amount)} token reward`,
        amount: formatCompactAmount(item.amount),
        ...(where ? { where } : {}),
        drawer,
      }
    }

    case "rewardDistributed": {
      const where = gaugeWhere(ctx, item.gaugeAddress)
      const voterLabel = voterDisplayName(item.contract)
      drawer.unshift(
        { label: "Caller", value: actor, mono: true },
        { label: "Voter contract", value: voterLabel },
        ...(item.gaugeAddress
          ? [
              {
                label: "Recipient gauge",
                value: shortenAddress(item.gaugeAddress),
                mono: true,
              },
            ]
          : []),
        ...(item.amount
          ? [{ label: "Amount", value: formatTokenAmount(item.amount) ?? "—" }]
          : []),
      )
      return {
        category: "automated",
        emoji: "💸",
        title: `${voterLabel} distributed ${formatCompactAmount(item.amount)} reward`,
        subtitle: `to ${where?.label ?? shortenAddress(item.gaugeAddress) ?? "gauge"}`,
        amount: formatCompactAmount(item.amount),
        ...(where ? { where } : {}),
        drawer,
      }
    }

    case "rewardNotified": {
      const where = gaugeWhere(ctx, item.gaugeAddress)
      drawer.unshift(
        { label: "Sender", value: actor, mono: true },
        ...(item.amount
          ? [{ label: "Amount", value: formatTokenAmount(item.amount) ?? "—" }]
          : []),
      )
      return {
        category: "reward",
        emoji: "🔔",
        title: `Reward stream notified · ${formatCompactAmount(item.amount)}`,
        subtitle: actor,
        amount: formatCompactAmount(item.amount),
        ...(where ? { where } : {}),
        drawer,
      }
    }

    case "rebaseClaimed": {
      drawer.unshift(
        { label: "Claimer", value: actor, mono: true },
        ...(item.tokenId
          ? [
              {
                label: "veMEZO token",
                value: `#${item.tokenId.toString()}`,
                mono: true,
              },
            ]
          : []),
        ...(item.amount
          ? [
              {
                label: "Amount",
                value: `${formatTokenAmount(item.amount) ?? "—"} MEZO`,
              },
            ]
          : []),
        ...(item.epochStart
          ? [{ label: "Epoch start", value: item.epochStart.toString() }]
          : []),
        ...(item.epochEnd
          ? [{ label: "Epoch end", value: item.epochEnd.toString() }]
          : []),
      )
      return {
        category: "reward",
        emoji: "🌀",
        title: `Claimed veMEZO rebase · ${formatCompactAmount(item.amount)} MEZO`,
        subtitle: `${actor}${item.tokenId ? ` · veMEZO #${item.tokenId}` : ""}`,
        amount: formatTokenAmount(item.amount),
        amountSubtext: "MEZO",
        drawer,
      }
    }

    case "merkleClaimed": {
      drawer.unshift(
        { label: "Claimer", value: actor, mono: true },
        ...(item.distributionId
          ? [
              {
                label: "Distribution ID",
                value: `#${item.distributionId.toString()}`,
              },
            ]
          : []),
        ...(item.amount
          ? [{ label: "Amount", value: formatTokenAmount(item.amount) ?? "—" }]
          : []),
      )
      return {
        category: "reward",
        emoji: "🎯",
        title:
          `Claimed merkle drop ${item.distributionId ? `#${item.distributionId}` : ""}`.trim(),
        subtitle: `${actor} · ${formatCompactAmount(item.amount)}`,
        amount: formatCompactAmount(item.amount),
        drawer,
      }
    }

    case "merkleDistributionAdded": {
      drawer.unshift(
        ...(item.distributionId
          ? [
              {
                label: "Distribution ID",
                value: `#${item.distributionId.toString()}`,
              },
            ]
          : []),
        ...(item.recipient
          ? [
              {
                label: "Handler",
                value: shortenAddress(item.recipient),
                mono: true,
              },
            ]
          : []),
        ...(item.epochStart
          ? [
              {
                label: "Start",
                value: formatTimestampHuman(Number(item.epochStart)),
              },
            ]
          : []),
      )
      return {
        category: "lifecycle",
        emoji: "📜",
        title: `Merkle distribution added${item.distributionId ? ` · #${item.distributionId}` : ""}`,
        subtitle: item.recipient
          ? `handler ${shortenAddress(item.recipient)}`
          : undefined,
        drawer,
      }
    }

    case "savingsDeposit":
    case "savingsWithdraw":
    case "savingsYieldClaimed": {
      const verb =
        item.actionType === "savingsDeposit"
          ? "Deposited"
          : item.actionType === "savingsWithdraw"
            ? "Withdrew"
            : "Claimed yield"
      drawer.unshift(
        { label: "User", value: actor, mono: true },
        ...(item.amount
          ? [
              {
                label: "Amount",
                value: `${formatTokenAmount(item.amount) ?? "—"} mUSD`,
              },
            ]
          : []),
      )
      return {
        category:
          item.actionType === "savingsYieldClaimed" ? "reward" : "incentive",
        emoji: item.actionType === "savingsYieldClaimed" ? "💰" : "🏦",
        title: `${verb} ${formatCompactAmount(item.amount)} mUSD${item.actionType === "savingsDeposit" ? " into Savings Rate" : item.actionType === "savingsWithdraw" ? " from Savings Rate" : ""}`,
        subtitle: actor,
        amount: formatCompactAmount(item.amount),
        amountSubtext: "mUSD",
        drawer,
      }
    }

    case "protocolYieldReceived":
    case "strategyYieldReceived": {
      const source =
        item.actionType === "protocolYieldReceived" ? "protocol" : "strategy"
      drawer.unshift(
        ...(item.amount
          ? [
              {
                label: "Amount",
                value: `${formatTokenAmount(item.amount) ?? "—"} mUSD`,
              },
            ]
          : []),
        { label: "Source", value: source },
      )
      return {
        category: "protocol",
        emoji: "📈",
        title: `Savings Rate vault received ${formatCompactAmount(item.amount)} mUSD (${source})`,
        subtitle:
          source === "protocol"
            ? "from PCV distribution"
            : "from yield strategy",
        amount: formatCompactAmount(item.amount),
        amountSubtext: "mUSD",
        drawer,
      }
    }

    case "pcvDistribution": {
      drawer.unshift(
        ...(item.recipient
          ? [
              {
                label: "Recipient",
                value: shortenAddress(item.recipient),
                mono: true,
              },
            ]
          : []),
        ...(item.amount
          ? [
              {
                label: "Amount",
                value: `${formatTokenAmount(item.amount) ?? "—"} mUSD`,
              },
            ]
          : []),
      )
      return {
        category: "protocol",
        emoji: "🏛",
        title: `PCV distributed ${formatCompactAmount(item.amount)} mUSD`,
        subtitle: `${TIGRIS_MAINTAINER_LABEL}${item.recipient ? ` · → ${shortenAddress(item.recipient)}` : ""}`,
        amount: formatCompactAmount(item.amount),
        amountSubtext: "mUSD",
        drawer,
      }
    }

    case "pcvDebtPayment": {
      drawer.unshift(
        ...(item.amount
          ? [
              {
                label: "Debt paid",
                value: `${formatTokenAmount(item.amount) ?? "—"} mUSD`,
              },
            ]
          : []),
      )
      return {
        category: "protocol",
        emoji: "🧾",
        title: `PCV repaid ${formatCompactAmount(item.amount)} mUSD of debt`,
        subtitle: TIGRIS_MAINTAINER_LABEL,
        amount: formatCompactAmount(item.amount),
        amountSubtext: "mUSD",
        drawer,
      }
    }

    case "periodUpdated": {
      const splitter = splitterDisplayName(item.contract)
      drawer.unshift(
        { label: "Splitter", value: splitter },
        ...(item.period
          ? [{ label: "Old period", value: item.period.toString() }]
          : []),
        ...(item.newPeriod
          ? [{ label: "New period", value: item.newPeriod.toString() }]
          : []),
        ...(item.firstRecipientAmount
          ? [
              {
                label: "First recipient",
                value: formatTokenAmount(item.firstRecipientAmount) ?? "—",
              },
            ]
          : []),
        ...(item.secondRecipientAmount
          ? [
              {
                label: "Second recipient",
                value: formatTokenAmount(item.secondRecipientAmount) ?? "—",
              },
            ]
          : []),
      )
      const periodStr =
        item.period && item.newPeriod
          ? `${item.period} → ${item.newPeriod}`
          : item.newPeriod
            ? `→ ${item.newPeriod}`
            : ""
      return {
        category: "automated",
        emoji: "🪙",
        title: `${splitter} period advanced${periodStr ? ` (${periodStr})` : ""}`,
        subtitle: TIGRIS_MAINTAINER_LABEL,
        drawer,
      }
    }

    case "epochProcessed": {
      drawer.unshift(
        ...(item.period
          ? [{ label: "Period", value: item.period.toString() }]
          : []),
        ...(item.epochIndex
          ? [{ label: "Epoch index", value: item.epochIndex.toString() }]
          : []),
        ...(item.emission
          ? [
              {
                label: "Emission",
                value: `${formatTokenAmount(item.emission) ?? "—"} MEZO`,
              },
            ]
          : []),
        ...(item.rebase
          ? [
              {
                label: "Rebase",
                value: `${formatTokenAmount(item.rebase) ?? "—"} MEZO`,
              },
            ]
          : []),
        ...(item.rewards
          ? [
              {
                label: "Rewards",
                value: `${formatTokenAmount(item.rewards) ?? "—"} MEZO`,
              },
            ]
          : []),
      )
      const total =
        (item.emission ?? 0n) + (item.rebase ?? 0n) + (item.rewards ?? 0n)
      return {
        category: "automated",
        emoji: "🪙",
        title: `MEZO emissions epoch processed · ${formatCompactAmount(total)} MEZO`,
        subtitle: item.epochIndex
          ? `epoch index ${item.epochIndex}`
          : TIGRIS_MAINTAINER_LABEL,
        amount: formatCompactAmount(total),
        amountSubtext: "MEZO",
        drawer,
      }
    }

    case "emissionsEnabled": {
      drawer.unshift(
        ...(item.period
          ? [{ label: "Active period", value: item.period.toString() }]
          : []),
      )
      return {
        category: "lifecycle",
        emoji: "🚦",
        title: "MEZO emissions enabled",
        subtitle: item.period ? `active period ${item.period}` : undefined,
        drawer,
      }
    }

    case "rebaseCheckpoint": {
      drawer.unshift(
        ...(item.period
          ? [
              {
                label: "Time",
                value: formatTimestampHuman(Number(item.period)),
              },
            ]
          : []),
        ...(item.amount
          ? [
              {
                label: "Tokens",
                value: `${formatTokenAmount(item.amount) ?? "—"} MEZO`,
              },
            ]
          : []),
      )
      return {
        category: "lifecycle",
        emoji: "📍",
        title: `Rebase checkpoint · ${formatCompactAmount(item.amount)} MEZO`,
        subtitle: undefined,
        amount: formatCompactAmount(item.amount),
        amountSubtext: "MEZO",
        drawer,
      }
    }

    case "thirdPartyGaugeCreated": {
      drawer.unshift(
        { label: "Operator", value: actor, mono: true },
        ...(item.gaugeAddress
          ? [
              {
                label: "Gauge",
                value: shortenAddress(item.gaugeAddress),
                mono: true,
              },
            ]
          : []),
        ...(item.metadata ? [{ label: "Metadata", value: item.metadata }] : []),
      )
      return {
        category: "lifecycle",
        emoji: "🤝",
        title: `Third-party gauge registered${item.metadata ? `: ${item.metadata}` : ""}`,
        subtitle: actor,
        drawer,
      }
    }

    case "validatorGaugeCreated": {
      drawer.unshift(
        { label: "Operator", value: actor, mono: true },
        ...(item.gaugeAddress
          ? [
              {
                label: "Gauge",
                value: shortenAddress(item.gaugeAddress),
                mono: true,
              },
            ]
          : []),
        ...(item.recipient
          ? [
              {
                label: "Beneficiary",
                value: shortenAddress(item.recipient),
                mono: true,
              },
            ]
          : []),
      )
      return {
        category: "lifecycle",
        emoji: "🛡",
        title: "Validator gauge created",
        subtitle: `${actor}${item.recipient ? ` → ${shortenAddress(item.recipient)}` : ""}`,
        drawer,
      }
    }

    case "validatorLeft": {
      drawer.unshift(
        { label: "Operator", value: actor, mono: true },
        ...(item.gaugeAddress
          ? [
              {
                label: "Gauge",
                value: shortenAddress(item.gaugeAddress),
                mono: true,
              },
            ]
          : []),
      )
      return {
        category: "lifecycle",
        emoji: "🚪",
        title: "Validator left",
        subtitle: actor,
        drawer,
      }
    }

    case "pairCreated":
    case "gaugeCreated": {
      const where = gaugeWhere(ctx, item.gaugeAddress)
      drawer.unshift(
        { label: "Creator", value: actor, mono: true },
        ...(item.gaugeAddress
          ? [
              {
                label: "Gauge",
                value: shortenAddress(item.gaugeAddress),
                mono: true,
              },
            ]
          : []),
      )
      return {
        category: "lifecycle",
        emoji: item.actionType === "pairCreated" ? "🔗" : "✨",
        title:
          item.actionType === "pairCreated"
            ? `Created Pair & Boost gauge for ${where?.label ?? "pool"}`
            : `Created Matchbox gauge for ${where?.label ?? "pool"}`,
        subtitle: actor,
        ...(where ? { where } : {}),
        drawer,
      }
    }

    case "gaugeKilled":
    case "gaugeRevived": {
      const where = gaugeWhere(ctx, item.gaugeAddress)
      drawer.unshift(
        ...(item.gaugeAddress
          ? [
              {
                label: "Gauge",
                value: shortenAddress(item.gaugeAddress),
                mono: true,
              },
            ]
          : []),
      )
      return {
        category: "lifecycle",
        emoji: item.actionType === "gaugeKilled" ? "🪦" : "💚",
        title:
          item.actionType === "gaugeKilled"
            ? `Killed gauge ${where?.label ?? ""}`.trim()
            : `Revived gauge ${where?.label ?? ""}`.trim(),
        subtitle: actor,
        ...(where ? { where } : {}),
        drawer,
      }
    }

    case "boostableTokenBurned": {
      drawer.unshift(
        ...(item.tokenId
          ? [
              {
                label: "Boostable token",
                value: `#${item.tokenId}`,
                mono: true,
              },
            ]
          : []),
        ...(item.gaugeAddress
          ? [
              {
                label: "Gauge",
                value: shortenAddress(item.gaugeAddress),
                mono: true,
              },
            ]
          : []),
      )
      return {
        category: "lifecycle",
        emoji: "🔥",
        title: `Boostable token burned${item.tokenId ? ` #${item.tokenId}` : ""}`,
        subtitle: actor,
        drawer,
      }
    }

    default: {
      const exhaustive: MezoActivityActionType = item.actionType
      return {
        category: "lifecycle",
        emoji: "•",
        title: exhaustive,
        subtitle: actor,
        drawer,
      }
    }
  }
}

export { shortenAddress, formatBoost, formatCompactAmount, formatUsd }
