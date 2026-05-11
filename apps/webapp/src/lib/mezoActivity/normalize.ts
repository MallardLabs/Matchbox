import type {
  MezoActivityApiItem,
  MezoActivityItem,
  MezoBoostContext,
} from "@/types/mezoActivity"
import { type Address, getAddress, isAddressEqual } from "viem"

type NormalizeContext = {
  boostVoter: Address
  poolsVoter: Address
}

type SortableActivity = MezoActivityItem & { logIndex: number }

export function classifyBoostContext(
  targetAddress: Address | undefined,
  context: NormalizeContext,
): MezoBoostContext {
  if (!targetAddress) return "unknown"
  if (isAddressEqual(targetAddress, context.boostVoter)) {
    return "mezoVeBtcPairBoost"
  }
  if (isAddressEqual(targetAddress, context.poolsVoter)) {
    return "matchboxGaugeBoost"
  }
  return "unknown"
}

export function sortActivityDesc(
  items: MezoActivityItem[],
): MezoActivityItem[] {
  return [...items].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp
    if (a.blockNumber !== b.blockNumber) {
      return b.blockNumber > a.blockNumber ? 1 : -1
    }
    const aIdx = a.logIndex ?? -1
    const bIdx = b.logIndex ?? -1
    return bIdx - aIdx
  })
}

export function dedupeActivity(items: MezoActivityItem[]): MezoActivityItem[] {
  const byId = new Map<string, MezoActivityItem>()
  for (const item of items) {
    const key =
      item.txHash && item.logIndex !== undefined
        ? `${item.txHash}:${item.logIndex}`
        : item.id
    const existing = byId.get(key)
    if (
      !existing ||
      (existing.source !== "subgraph" && item.source === "subgraph")
    ) {
      byId.set(key, item)
    }
  }
  return [...byId.values()]
}

export type GroupedActivity = {
  primary: MezoActivityItem
  siblings: MezoActivityItem[]
}

export function groupActivityByTx(
  items: MezoActivityItem[],
): GroupedActivity[] {
  const seenEventIds = new Set<string>()
  const groups = new Map<string, GroupedActivity>()
  const order: string[] = []
  for (const item of items) {
    if (seenEventIds.has(item.id)) continue
    seenEventIds.add(item.id)
    const key = item.txHash
      ? `${item.txHash}:${item.actorAddress ?? "unknown"}`
      : item.id
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { primary: item, siblings: [] })
      order.push(key)
    } else {
      existing.siblings.push(item)
    }
  }
  return order.map((key) => groups.get(key) as GroupedActivity)
}

export function normalizeAddress(
  value: string | undefined,
): Address | undefined {
  if (!value) return undefined
  try {
    return getAddress(value)
  } catch {
    return undefined
  }
}

export function serializeActivityItem(
  item: MezoActivityItem,
): MezoActivityApiItem {
  return {
    id: item.id,
    blockNumber: item.blockNumber.toString(),
    timestamp: item.timestamp,
    actionType: item.actionType,
    boostContext: item.boostContext,
    source: item.source,
    ...(item.txHash ? { txHash: item.txHash } : {}),
    ...(item.txFrom ? { txFrom: item.txFrom } : {}),
    ...(item.actorAddress ? { actorAddress: item.actorAddress } : {}),
    ...(item.recipient ? { recipient: item.recipient } : {}),
    ...(item.gaugeAddress ? { gaugeAddress: item.gaugeAddress } : {}),
    ...(item.pokeMethod ? { pokeMethod: item.pokeMethod } : {}),
    ...(item.contract ? { contract: item.contract } : {}),
    ...(item.metadata ? { metadata: item.metadata } : {}),
    ...(item.logIndex !== undefined ? { logIndex: item.logIndex } : {}),
    ...(item.explorerUrl ? { explorerUrl: item.explorerUrl } : {}),
    ...(item.tokenId !== undefined ? { tokenId: item.tokenId.toString() } : {}),
    ...(item.amount !== undefined ? { amount: item.amount.toString() } : {}),
    ...(item.duration !== undefined
      ? { duration: item.duration.toString() }
      : {}),
    ...(item.weight !== undefined ? { weight: item.weight.toString() } : {}),
    ...(item.totalWeight !== undefined
      ? { totalWeight: item.totalWeight.toString() }
      : {}),
    ...(item.boost !== undefined ? { boost: item.boost.toString() } : {}),
    ...(item.period !== undefined ? { period: item.period.toString() } : {}),
    ...(item.newPeriod !== undefined
      ? { newPeriod: item.newPeriod.toString() }
      : {}),
    ...(item.firstRecipientAmount !== undefined
      ? { firstRecipientAmount: item.firstRecipientAmount.toString() }
      : {}),
    ...(item.secondRecipientAmount !== undefined
      ? { secondRecipientAmount: item.secondRecipientAmount.toString() }
      : {}),
    ...(item.emission !== undefined
      ? { emission: item.emission.toString() }
      : {}),
    ...(item.rebase !== undefined ? { rebase: item.rebase.toString() } : {}),
    ...(item.rewards !== undefined ? { rewards: item.rewards.toString() } : {}),
    ...(item.epochIndex !== undefined
      ? { epochIndex: item.epochIndex.toString() }
      : {}),
    ...(item.epochStart !== undefined
      ? { epochStart: item.epochStart.toString() }
      : {}),
    ...(item.epochEnd !== undefined
      ? { epochEnd: item.epochEnd.toString() }
      : {}),
    ...(item.distributionId !== undefined
      ? { distributionId: item.distributionId.toString() }
      : {}),
  }
}

export function deserializeActivityItem(
  item: MezoActivityApiItem,
): MezoActivityItem {
  return {
    id: item.id,
    blockNumber: BigInt(item.blockNumber),
    timestamp: item.timestamp,
    actionType: item.actionType,
    boostContext: item.boostContext,
    source: item.source,
    ...(item.txHash ? { txHash: item.txHash } : {}),
    ...(item.txFrom ? { txFrom: item.txFrom } : {}),
    ...(item.actorAddress ? { actorAddress: item.actorAddress } : {}),
    ...(item.recipient ? { recipient: item.recipient } : {}),
    ...(item.gaugeAddress ? { gaugeAddress: item.gaugeAddress } : {}),
    ...(item.pokeMethod ? { pokeMethod: item.pokeMethod } : {}),
    ...(item.contract ? { contract: item.contract } : {}),
    ...(item.metadata ? { metadata: item.metadata } : {}),
    ...(item.logIndex !== undefined ? { logIndex: item.logIndex } : {}),
    ...(item.explorerUrl ? { explorerUrl: item.explorerUrl } : {}),
    ...(item.tokenId ? { tokenId: BigInt(item.tokenId) } : {}),
    ...(item.amount ? { amount: BigInt(item.amount) } : {}),
    ...(item.duration ? { duration: BigInt(item.duration) } : {}),
    ...(item.weight ? { weight: BigInt(item.weight) } : {}),
    ...(item.totalWeight ? { totalWeight: BigInt(item.totalWeight) } : {}),
    ...(item.boost ? { boost: BigInt(item.boost) } : {}),
    ...(item.period ? { period: BigInt(item.period) } : {}),
    ...(item.newPeriod ? { newPeriod: BigInt(item.newPeriod) } : {}),
    ...(item.firstRecipientAmount
      ? { firstRecipientAmount: BigInt(item.firstRecipientAmount) }
      : {}),
    ...(item.secondRecipientAmount
      ? { secondRecipientAmount: BigInt(item.secondRecipientAmount) }
      : {}),
    ...(item.emission ? { emission: BigInt(item.emission) } : {}),
    ...(item.rebase ? { rebase: BigInt(item.rebase) } : {}),
    ...(item.rewards ? { rewards: BigInt(item.rewards) } : {}),
    ...(item.epochIndex ? { epochIndex: BigInt(item.epochIndex) } : {}),
    ...(item.epochStart ? { epochStart: BigInt(item.epochStart) } : {}),
    ...(item.epochEnd ? { epochEnd: BigInt(item.epochEnd) } : {}),
    ...(item.distributionId
      ? { distributionId: BigInt(item.distributionId) }
      : {}),
  }
}

export function toSortable(item: MezoActivityItem): SortableActivity {
  return {
    ...item,
    logIndex: item.logIndex ?? -1,
  }
}
