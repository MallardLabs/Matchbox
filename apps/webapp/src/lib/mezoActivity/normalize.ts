import type {
  MezoActivityApiItem,
  MezoActivityItem,
  MezoBoostContext,
} from "@/types/mezoActivity"
import { getAddress, isAddressEqual, type Address } from "viem"

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

export function sortActivityDesc(items: MezoActivityItem[]): MezoActivityItem[] {
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
    const key = item.txHash
      ? `${item.txHash}:${item.logIndex ?? -1}:${item.actionType}`
      : item.id
    const existing = byId.get(key)
    if (!existing || existing.source !== "subgraph") {
      byId.set(key, item)
    }
  }
  return [...byId.values()]
}

export function normalizeAddress(value: string | undefined): Address | undefined {
  if (!value) return undefined
  try {
    return getAddress(value)
  } catch {
    return undefined
  }
}

export function serializeActivityItem(item: MezoActivityItem): MezoActivityApiItem {
  return {
    id: item.id,
    blockNumber: item.blockNumber.toString(),
    timestamp: item.timestamp,
    actionType: item.actionType,
    boostContext: item.boostContext,
    source: item.source,
    ...(item.txHash ? { txHash: item.txHash } : {}),
    ...(item.actorAddress ? { actorAddress: item.actorAddress } : {}),
    ...(item.gaugeAddress ? { gaugeAddress: item.gaugeAddress } : {}),
    ...(item.logIndex !== undefined ? { logIndex: item.logIndex } : {}),
    ...(item.explorerUrl ? { explorerUrl: item.explorerUrl } : {}),
    ...(item.tokenId !== undefined ? { tokenId: item.tokenId.toString() } : {}),
    ...(item.amount !== undefined ? { amount: item.amount.toString() } : {}),
    ...(item.duration !== undefined ? { duration: item.duration.toString() } : {}),
  }
}

export function deserializeActivityItem(item: MezoActivityApiItem): MezoActivityItem {
  return {
    id: item.id,
    blockNumber: BigInt(item.blockNumber),
    timestamp: item.timestamp,
    actionType: item.actionType,
    boostContext: item.boostContext,
    source: item.source,
    ...(item.txHash ? { txHash: item.txHash } : {}),
    ...(item.actorAddress ? { actorAddress: item.actorAddress } : {}),
    ...(item.gaugeAddress ? { gaugeAddress: item.gaugeAddress } : {}),
    ...(item.logIndex !== undefined ? { logIndex: item.logIndex } : {}),
    ...(item.explorerUrl ? { explorerUrl: item.explorerUrl } : {}),
    ...(item.tokenId ? { tokenId: BigInt(item.tokenId) } : {}),
    ...(item.amount ? { amount: BigInt(item.amount) } : {}),
    ...(item.duration ? { duration: BigInt(item.duration) } : {}),
  }
}

export function toSortable(item: MezoActivityItem): SortableActivity {
  return {
    ...item,
    logIndex: item.logIndex ?? -1,
  }
}
