import { formatFixedPoint, formatTokenAmountDigits } from "@/lib/money"
import type { GaugeProfile } from "@/lib/supabase"
import {
  type Address,
  isAddress,
  isAddressEqual,
  parseUnits,
  zeroAddress,
} from "viem"

export type LockKind = "veMEZO" | "veBTC"

/** One lock as the Overview renders it: chain state plus derived context. */
export type LockView = {
  key: string
  kind: LockKind
  id: string
  tokenId: bigint
  amount: bigint
  votingPower: bigint
  /** veBTC only; boost = votingPower / unboostedVotingPower. */
  unboostedVotingPower: bigint | null
  end: bigint
  isPermanent: boolean
  expired: boolean
  /** Escrow `voted` flag: the lock has live votes (blocks merge/withdraw). */
  hasActiveVotes: boolean | undefined
  votedThisEpoch: boolean
  /** veBTC: the boost gauge this lock backs, when it has one. */
  gauge: Address | null
  profile: GaugeProfile | null
  /** Claim sources this lock signs for; null when nothing is claimable. */
  claimable: { usdMicro: bigint; unpriced: boolean } | null
}

const DAY_SECONDS = 86_400n

export type AmountStyle = "long" | "short"

// Whole MEZO from 100k up so seven-figure locks still fit the 196px tile.
const WHOLE_FROM = 100_000n * 10n ** 18n

function lockDigits(
  kind: LockKind,
  amount: bigint,
  style: AmountStyle,
): number {
  if (kind === "veBTC") return 4
  return style === "long" && amount < WHOLE_FROM ? 2 : 0
}

// Below the tile's usual precision a non-empty lock must not read as zero:
// show two significant digits, up to 8 decimals (1 sat for BTC).
const SMALL_DIGITS = 8

/** "0.1243", or "0.00005" / "<0.00000001" when the usual digits round to 0. */
function formatAmount(amount: bigint, digits: number): string {
  const text = formatTokenAmountDigits(amount, 18, digits)
  if (amount <= 0n || /[1-9]/.test(text)) return text
  if (amount < 10n ** BigInt(18 - SMALL_DIGITS)) {
    return `<0.${"0".repeat(SMALL_DIGITS - 1)}1`
  }
  const fraction = amount.toString().padStart(18, "0")
  const first = fraction.search(/[1-9]/)
  const shown = Math.min(SMALL_DIGITS, first + 2)
  return formatTokenAmountDigits(amount, 18, shown).replace(/0+$/, "")
}

/** Locked principal: "0.1243 BTC", "12,400.00 MEZO" (short: "12,400 MEZO"). */
export function formatLockAmount(
  kind: LockKind,
  amount: bigint,
  style: AmountStyle = "long",
): string {
  const unit = kind === "veBTC" ? "BTC" : "MEZO"
  return `${formatAmount(amount, lockDigits(kind, amount, style))} ${unit}`
}

export function formatVotingPower(
  kind: LockKind,
  votingPower: bigint,
  style: AmountStyle = "long",
): string {
  return `${formatAmount(votingPower, lockDigits(kind, votingPower, style))} ${kind}`
}

/** Full-precision amount for accessible labels and tooltips. */
export function exactLockAmount(kind: LockKind, amount: bigint): string {
  return `${formatFixedPoint(amount, 18)} ${kind === "veBTC" ? "BTC" : "MEZO"}`
}

export function isExpired(
  lock: { end: bigint; isPermanent: boolean },
  nowSeconds: bigint,
): boolean {
  return !lock.isPermanent && lock.end <= nowSeconds
}

/** "5.00×" from boosted over unboosted voting power, two decimals, floored. */
export function boostLabel(
  votingPower: bigint,
  unboosted: bigint | null,
): string | null {
  if (unboosted === null || unboosted <= 0n || votingPower <= 0n) return null
  const hundredths = (votingPower * 100n) / unboosted
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}×`
}

/** "4 days", "2mo 27d", "3y 8mo" (short style: "4d"). */
export function formatRemaining(
  end: bigint,
  nowSeconds: bigint,
  style: "long" | "short",
): string {
  const remaining = end - nowSeconds
  const days =
    remaining <= 0n ? 0n : (remaining + DAY_SECONDS - 1n) / DAY_SECONDS
  if (days < 60n) {
    if (style === "short") return `${days}d`
    return days === 1n ? "1 day" : `${days} days`
  }
  if (days < 365n) return `${days / 30n}mo ${days % 30n}d`
  const months = (days % 365n) / 30n
  return months === 0n ? `${days / 365n}y` : `${days / 365n}y ${months}mo`
}

export function lockStatus(
  lock: Pick<LockView, "end" | "isPermanent" | "expired">,
  nowSeconds: bigint,
  style: "long" | "short" = "long",
): string {
  if (lock.expired) return "Expired"
  if (lock.isPermanent) return "Auto max-locked"
  return `Unlocks in ${formatRemaining(lock.end, nowSeconds, style)}`
}

export type LockActionId =
  | "claim"
  | "refresh-boost"
  | "auto-max-lock"
  | "disable-auto-max-lock"
  | "manage-profile"
  | "withdraw"

export type LockAction = {
  id: LockActionId
  label: string
  /** Why the action can't run right now (shown instead of running it). */
  blocked: string | null
}

const RESET_VOTES = "Reset votes first"

/** Face-down action list, in the J02 order. Transfer/Merge sit in the footer. */
export function lockActions(
  lock: LockView,
  context: { isOwner: boolean },
): LockAction[] {
  const actions: LockAction[] = []
  if (lock.claimable) {
    actions.push({ id: "claim", label: "Claim", blocked: null })
  }
  if (lock.kind === "veBTC" && !lock.expired) {
    actions.push({ id: "refresh-boost", label: "Refresh boost", blocked: null })
  }
  if (!lock.expired && !lock.isPermanent) {
    actions.push({ id: "auto-max-lock", label: "Auto max-lock", blocked: null })
  }
  if (lock.isPermanent) {
    actions.push({
      id: "disable-auto-max-lock",
      label: "Disable Auto max-lock",
      blocked: lock.hasActiveVotes ? RESET_VOTES : null,
    })
  }
  if (lock.kind === "veBTC" && lock.gauge && context.isOwner) {
    actions.push({
      id: "manage-profile",
      label: "Manage profile",
      blocked: null,
    })
  }
  if (lock.expired) {
    // Live votes are reset inside the withdraw sheet.
    actions.push({ id: "withdraw", label: "Withdraw", blocked: null })
  }
  return actions
}

export type MergePlan =
  | { ok: true; source: LockView; target: LockView }
  | { ok: false; reason: string }

function sourceBlocker(lock: LockView): string | null {
  if (lock.isPermanent) return `#${lock.id} is Auto max-locked`
  if (lock.hasActiveVotes) return `#${lock.id} has live votes`
  return null
}

function targetBlocker(lock: LockView): string | null {
  return lock.expired ? `#${lock.id} has expired` : null
}

/**
 * The escrow burns `source` into `target`: the source can't be Auto
 * max-locked or carry live votes, and the target can't be expired. Prefers
 * `from` as the source; flips the pair when only the reverse is valid.
 */
export function mergePlan(from: LockView, other: LockView): MergePlan {
  if (from.kind !== other.kind) return { ok: false, reason: "Different escrow" }
  if (from.id === other.id) return { ok: false, reason: "Same lock" }
  const forward = sourceBlocker(from) ?? targetBlocker(other)
  if (forward === null) return { ok: true, source: from, target: other }
  const reverse = sourceBlocker(other) ?? targetBlocker(from)
  if (reverse === null) return { ok: true, source: other, target: from }
  return { ok: false, reason: forward }
}

/** Result of a merge: amounts add, the later end wins, permanence wins. */
export function mergedLock(
  source: LockView,
  target: LockView,
): Pick<LockView, "amount" | "end" | "isPermanent" | "expired"> {
  return {
    amount: source.amount + target.amount,
    end: source.end > target.end ? source.end : target.end,
    isPermanent: source.isPermanent || target.isPermanent,
    expired: false,
  }
}

export const WEEK_SECONDS = 604_800n
/** veMEZO MAXTIME, probed on the escrow: 208 weeks (veBTC allows 4 weeks). */
export const VE_MEZO_MAX_LOCK = 208n * WEEK_SECONDS

/** Parses a typed token amount ("1,000.5") to base units; null if invalid. */
export function parseTokenInput(
  value: string,
  decimals: number,
): bigint | null {
  const cleaned = value.replace(/,/g, "").trim()
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "" || cleaned === ".") {
    return null
  }
  try {
    const amount = parseUnits(cleaned, decimals)
    return amount > 0n ? amount : null
  } catch {
    return null
  }
}

/** Voting power a new veMEZO lock starts with: linear in the week-rounded end. */
export function initialVotingPower(
  amount: bigint,
  duration: bigint,
  autoMaxLock: boolean,
  nowSeconds: bigint,
): bigint {
  if (autoMaxLock) return amount
  const unlock = ((nowSeconds + duration) / WEEK_SECONDS) * WEEK_SECONDS
  const span = unlock > nowSeconds ? unlock - nowSeconds : 0n
  return (amount * span) / VE_MEZO_MAX_LOCK
}

/** Transfer recipient check; checksummed mixed-case input must be valid. */
export function recipientError(
  value: string,
  owner: Address | undefined,
): string | null {
  const trimmed = value.trim()
  if (trimmed === "") return "Enter an address"
  if (!isAddress(trimmed)) return "Not a valid address"
  if (isAddressEqual(trimmed, zeroAddress)) return "That's the zero address"
  if (owner && isAddressEqual(trimmed, owner)) return "That's this wallet"
  return null
}

export type VoterId = "boost" | "third-party" | "pools" | "validators"

/** Voters whose live votes set an escrow's `voted` flag. */
export const VOTERS_FOR: Record<LockKind, VoterId[]> = {
  veMEZO: ["boost", "third-party"],
  veBTC: ["pools", "validators"],
}

export const RESET_LABEL: Record<VoterId, string> = {
  boost: "Reset boost votes",
  "third-party": "Reset MEZO gauge votes",
  pools: "Reset pool votes",
  validators: "Reset validator votes",
}

export type VoterRead = {
  voter: VoterId
  usedWeights: bigint | undefined
  lastVoted: bigint | undefined
}

export type ResetPlan =
  | { status: "loading" }
  /** `resets` run before the action; `blockedBy` voted this epoch. */
  | { status: "ready"; resets: VoterId[]; blockedBy: VoterId[] }

/**
 * Withdraw (and merge) revert while a lock has live votes. Each voter that
 * still holds weight needs `reset(id)` first, which that voter refuses once
 * the lock has voted there this epoch.
 */
export function resetPlan(
  reads: VoterRead[],
  epochStart: bigint | undefined,
): ResetPlan {
  if (
    epochStart === undefined ||
    reads.some(
      (read) => read.usedWeights === undefined || read.lastVoted === undefined,
    )
  ) {
    return { status: "loading" }
  }
  const holding = reads.filter((read) => (read.usedWeights ?? 0n) > 0n)
  const blocked = holding.filter((read) => (read.lastVoted ?? 0n) >= epochStart)
  return {
    status: "ready",
    resets: holding
      .filter((read) => !blocked.includes(read))
      .map((read) => read.voter),
    blockedBy: blocked.map((read) => read.voter),
  }
}
