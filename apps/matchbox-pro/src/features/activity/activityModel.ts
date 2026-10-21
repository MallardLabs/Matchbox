import type { ActivityItem, ActivityKind } from "@/features/history/useHistory"
import { formatNative } from "@/features/rewards/claimSources"

// Normalized activity rows → the explorer's events. One event per
// transaction and action family: a multi-gauge vote is one "Voted" row with
// its allocation, a claim tx is one "Claimed" row with per-token amounts.

export type KindFilter =
  | "all"
  | "votes"
  | "claims"
  | "locks"
  | "incentives"
  | "profiles"

export const KIND_FILTERS: ReadonlyArray<{
  id: KindFilter
  label: string
  kinds: readonly ActivityKind[] | undefined
}> = [
  { id: "all", label: "All", kinds: undefined },
  {
    id: "votes",
    label: "Votes",
    kinds: [
      "voted",
      "vote_reset",
      "pool_ballot",
      "validator_ballot",
      "boost_refreshed",
    ],
  },
  { id: "claims", label: "Claims", kinds: ["claimed"] },
  {
    id: "locks",
    label: "Locks",
    kinds: [
      "lock_created",
      "lock_increased",
      "lock_extended",
      "lock_merged",
      "lock_withdrawn",
      "lock_permanent",
      "lock_unlocked",
      "lock_transferred",
    ],
  },
  { id: "incentives", label: "Incentives", kinds: ["incentive_deposited"] },
  { id: "profiles", label: "Profiles", kinds: ["profile_published"] },
]

export function filterKinds(
  filter: KindFilter,
): readonly ActivityKind[] | undefined {
  return KIND_FILTERS.find((item) => item.id === filter)?.kinds
}

export type ActivityEvent = {
  id: string
  kind: ActivityKind
  items: ActivityItem[]
  txHash: string | null
  timestamp: number
  epochStart: number
  blockNumber: bigint
  status: "final" | "signed"
}

const VOTE_KINDS: ReadonlySet<ActivityKind> = new Set([
  "voted",
  "vote_reset",
  "pool_ballot",
  "validator_ballot",
])

function family(item: ActivityItem): string {
  if (VOTE_KINDS.has(item.kind))
    return `vote:${item.tokenId ?? ""}:${item.source}`
  if (item.kind === "claimed") return "claim"
  return `item:${item.id}`
}

/** Groups rows (newest first) into events, keeping the input order. */
export function groupEvents(items: ActivityItem[]): ActivityEvent[] {
  const events: ActivityEvent[] = []
  const byKey = new Map<string, ActivityEvent>()
  for (const item of items) {
    const key = item.txHash ? `${item.txHash}:${family(item)}` : `id:${item.id}`
    const existing = byKey.get(key)
    if (existing) {
      existing.items.push(item)
      // A re-vote emits Abstained then Voted in one tx: the event is a vote.
      if (existing.kind === "vote_reset" && item.kind !== "vote_reset") {
        existing.kind = item.kind
      }
      continue
    }
    const event: ActivityEvent = {
      id: item.id,
      kind: item.kind,
      items: [item],
      txHash: item.txHash,
      timestamp: item.timestamp,
      epochStart: item.epochStart,
      blockNumber: item.blockNumber,
      status: item.status,
    }
    byKey.set(key, event)
    events.push(event)
  }
  return events
}

export type Escrow = "veMEZO" | "veBTC"

/**
 * Escrow behind a row: BoostVoter ballots are veMEZO, pool/validator veBTC.
 * Lock rows (source VOTING_ESCROW) fall back to the wallet's own lock ids.
 */
export function escrowOf(item: ActivityItem, names?: Names): Escrow | null {
  if (item.source === "BOOST_VOTER" || item.source === "THIRD_PARTY_VOTER") {
    return "veMEZO"
  }
  if (item.source === "POOLS_VOTER" || item.source === "VALIDATORS_VOTER") {
    return "veBTC"
  }
  if (item.kind === "boost_refreshed") return "veBTC"
  if (item.tokenId !== null && names?.lock) return names.lock(item.tokenId)
  return null
}

export type TokenMeta = { symbol: string; decimals: number }

export type Names = {
  gauge: (address: string) => string | null
  token: (address: string) => TokenMeta | null
  /** Escrow of one of the viewed wallet's own locks; null when unknown. */
  lock?: ((tokenId: bigint) => Escrow | null) | undefined
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function lockRef(escrow: Escrow | null, tokenId: bigint | null): string | null {
  if (tokenId === null) return null
  return escrow ? `${escrow} #${tokenId}` : `#${tokenId}`
}

function gaugeLabel(names: Names, address: string | null): string | null {
  if (!address) return null
  return names.gauge(address) ?? short(address)
}

export type AllocationLine = { gauge: string; label: string; bps: bigint }

/** Vote weights in a tx → share of the ballot, largest first. */
export function allocation(
  event: ActivityEvent,
  names: Names,
): AllocationLine[] {
  const votes = event.items.filter(
    (item) => item.kind !== "vote_reset" && item.gauge && item.weight,
  )
  const total = votes.reduce((sum, item) => sum + (item.weight ?? 0n), 0n)
  if (total === 0n) return []
  return votes
    .map((item) => ({
      gauge: item.gauge ?? "",
      label: gaugeLabel(names, item.gauge) ?? "",
      bps: ((item.weight ?? 0n) * 10_000n) / total,
    }))
    .sort((a, b) => (a.bps === b.bps ? 0 : a.bps > b.bps ? -1 : 1))
}

export function formatShare(bps: bigint): string {
  return `${(bps + 50n) / 100n}%`
}

export function allocationText(lines: AllocationLine[], max = 3): string {
  const shown = lines
    .slice(0, max)
    .map((line) => `${line.label} ${formatShare(line.bps)}`)
  if (lines.length > max) shown.push(`+${lines.length - max}`)
  return shown.join(" · ")
}

function humanize(actionType: string): string {
  const text = actionType.toLowerCase().replaceAll("_", " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function first(event: ActivityEvent): ActivityItem {
  const item = event.items[0]
  if (!item) throw new Error("empty activity event")
  return item
}

/** "Voted · veMEZO #4821" — the short title used on phones and in the panel. */
export function eventTitle(event: ActivityEvent, names: Names): string {
  const item = first(event)
  const lock = lockRef(escrowOf(item, names), item.tokenId)
  switch (event.kind) {
    case "voted":
      return ["Voted", lock].filter(Boolean).join(" · ")
    case "pool_ballot":
      return ["Voted", "pool ballot", lock].filter(Boolean).join(" · ")
    case "validator_ballot":
      return ["Voted", "validator ballot", lock].filter(Boolean).join(" · ")
    case "vote_reset":
      return ["Vote reset", lock].filter(Boolean).join(" · ")
    case "claimed":
      return item.rewardType === "Fee"
        ? "Claimed · pool fees"
        : "Claimed · bribes"
    case "incentive_deposited":
      return ["Incentive deposited", gaugeLabel(names, item.gauge)]
        .filter(Boolean)
        .join(" · ")
    case "boost_refreshed":
      return ["Boost refreshed", lockRef("veBTC", item.boostableTokenId)]
        .filter(Boolean)
        .join(" · ")
    case "lock_created":
      return ["Lock created", lock].filter(Boolean).join(" · ")
    case "lock_increased":
      return ["Lock increased", lock].filter(Boolean).join(" · ")
    case "lock_extended":
      return ["Lock extended", lock].filter(Boolean).join(" · ")
    case "lock_merged": {
      const from = item.lock?.mergeSourceTokenId
      const into = item.lock?.mergeDestTokenId ?? item.tokenId
      return from !== null && from !== undefined && into !== null
        ? `Merged locks · #${from} into #${into}`
        : ["Merged locks", lock].filter(Boolean).join(" · ")
    }
    case "lock_withdrawn":
      return ["Lock withdrawn", lock].filter(Boolean).join(" · ")
    case "lock_permanent":
      return ["Auto max-locked", lock].filter(Boolean).join(" · ")
    case "lock_unlocked":
      return ["Auto max-lock off", lock].filter(Boolean).join(" · ")
    case "lock_transferred":
      return ["Lock transferred", lock].filter(Boolean).join(" · ")
    case "profile_published":
      return ["Profile published", gaugeLabel(names, item.gauge)]
        .filter(Boolean)
        .join(" · ")
    case "protocol":
      return [humanize(item.actionType), gaugeLabel(names, item.gauge)]
        .filter(Boolean)
        .join(" · ")
  }
}

/** Title plus detail for the desktop row: allocation, gauge, merge note. */
export function eventLine(event: ActivityEvent, names: Names): string {
  const title = eventTitle(event, names)
  if (
    event.kind === "voted" ||
    event.kind === "pool_ballot" ||
    event.kind === "validator_ballot"
  ) {
    const lines = allocation(event, names)
    return lines.length > 0 ? `${title} → ${allocationText(lines)}` : title
  }
  if (event.kind === "lock_merged") return `${title} · irreversible`
  if (event.kind === "claimed") {
    const gauges = new Set(
      event.items.map((item) => item.gauge).filter(Boolean),
    )
    const only = gauges.size === 1 ? first(event).gauge : null
    return only ? `${title} · ${gaugeLabel(names, only)}` : title
  }
  return title
}

/** Native amounts by token ("241.20 MEZO"), or null when the event has none. */
export function eventAmount(event: ActivityEvent, names: Names): string | null {
  const item = first(event)
  if (event.kind === "lock_increased" && item.lock) {
    const { prevAmount, postAmount } = item.lock
    if (prevAmount !== null && postAmount !== null && postAmount > prevAmount) {
      const meta = lockToken(escrowOf(item, names))
      return meta
        ? `+${formatNative(postAmount - prevAmount, meta.decimals)} ${meta.symbol}`
        : null
    }
  }
  if (event.kind.startsWith("lock_")) {
    const amount = item.lock?.postAmount ?? item.amount
    const meta = lockToken(escrowOf(item, names))
    if (amount === null || amount === 0n || !meta) return null
    return `${formatNative(amount, meta.decimals)} ${meta.symbol}`
  }
  const totals = new Map<string, bigint>()
  for (const row of event.items) {
    if (!row.token || row.amount === null) continue
    const key = row.token.toLowerCase()
    totals.set(key, (totals.get(key) ?? 0n) + row.amount)
  }
  const parts: string[] = []
  for (const [token, amount] of totals) {
    const meta = names.token(token)
    if (!meta) continue
    parts.push(`${formatNative(amount, meta.decimals)} ${meta.symbol}`)
  }
  return parts.length > 0 ? parts.join(" · ") : null
}

function lockToken(escrow: Escrow | null): TokenMeta | null {
  if (escrow === "veMEZO") return { symbol: "MEZO", decimals: 18 }
  if (escrow === "veBTC") return { symbol: "BTC", decimals: 18 }
  return null
}

/** Voting power a ballot used (Σ vote weights), 18-decimal ve units. */
export function powerUsed(event: ActivityEvent): bigint | null {
  if (!VOTE_KINDS.has(event.kind) || event.kind === "vote_reset") return null
  const total = event.items
    .filter((item) => item.kind !== "vote_reset")
    .reduce((sum, item) => sum + (item.weight ?? 0n), 0n)
  return total > 0n ? total : null
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

/** "Aug 27 14:02" in UTC; `dateOnly` drops the time. */
export function formatWhen(seconds: number, dateOnly = false): string {
  const date = new Date(seconds * 1000)
  const day = `${MONTHS[date.getUTCMonth()]} ${pad(date.getUTCDate())}`
  if (dateOnly) return day
  return `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

export function permalinkPath(address: string, txHash: string): string {
  return `/activity/${address.toLowerCase()}/tx/${txHash.toLowerCase()}`
}

export const ACTIVITY_CSV_HEADERS = [
  "timestamp",
  "time_utc",
  "epoch_start",
  "block",
  "tx",
  "kind",
  "event",
  "amount",
  "status",
  "lock",
  "gauges",
]

export function activityCsvRows(
  events: ActivityEvent[],
  names: Names,
): Array<Array<string | number | null>> {
  return events.map((event) => {
    const item = first(event)
    return [
      event.timestamp,
      new Date(event.timestamp * 1000).toISOString(),
      event.epochStart,
      event.blockNumber === 0n ? null : event.blockNumber.toString(),
      event.txHash,
      event.kind,
      eventLine(event, names),
      eventAmount(event, names),
      event.status,
      item.tokenId === null ? null : item.tokenId.toString(),
      Array.from(
        new Set(event.items.map((row) => row.gauge).filter(Boolean)),
      ).join(" "),
    ]
  })
}
