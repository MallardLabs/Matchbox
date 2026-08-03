import { useNetwork } from "@/contexts/NetworkContext"
import { WALLET_ACTION_TYPES_GRAPHQL } from "@/lib/mezoActivity/constants"
import { deserializeActivityItem } from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityApiResponse,
  MezoActivityFilter,
  MezoActivityItem,
} from "@/types/mezoActivity"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { Address } from "viem"

type UseWalletTransactionsParams = {
  actor: Address | undefined
  filters?: MezoActivityFilter[]
  fromTimestamp?: number
  toTimestamp?: number
  page?: number
  limit?: number
  actionTypes?: readonly string[]
}

const NETWORK_BY_CHAIN: Record<number, "mainnet" | "testnet"> = {
  [CHAIN_ID.mainnet]: "mainnet",
  [CHAIN_ID.testnet]: "testnet",
}

const LOCK_ACTIONS: ReadonlySet<MezoActivityItem["actionType"]> = new Set([
  "lockCreated",
  "lockAmountIncreased",
  "lockWithdrawn",
  "lockPermanent",
  "lockPermanentUnlocked",
  "lockTransferred",
  "lockMerged",
])

const CLAIM_ACTIONS: ReadonlySet<MezoActivityItem["actionType"]> = new Set([
  "voteFeeClaimed",
  "voteBribeClaimed",
  "rebaseClaimed",
  "merkleClaimed",
  "savingsYieldClaimed",
])

const CAPITAL_ACTIONS: ReadonlySet<MezoActivityItem["actionType"]> = new Set([
  "savingsDeposit",
  "savingsWithdraw",
  "lpAdded",
  "lpRemoved",
  "lpStaked",
  "lpUnstaked",
  "poolCreated",
])

const INCENTIVE_ACTIONS: ReadonlySet<MezoActivityItem["actionType"]> = new Set([
  "incentiveAdded",
])

function matchesWalletFilter(
  item: MezoActivityItem,
  selected: Set<MezoActivityFilter>,
): boolean {
  if (LOCK_ACTIONS.has(item.actionType)) return selected.has("locks")
  if (item.actionType === "lockExtended") return selected.has("extensions")
  if (CLAIM_ACTIONS.has(item.actionType)) return selected.has("claims")
  if (CAPITAL_ACTIONS.has(item.actionType)) return selected.has("capital")
  if (item.actionType === "swap") return selected.has("swaps")
  if (INCENTIVE_ACTIONS.has(item.actionType)) return selected.has("incentives")
  if (item.actionType === "boostVote" || item.actionType === "boostAbstain") {
    if (item.boostContext === "matchboxGaugeBoost") {
      return selected.has("boostMatchbox")
    }
    if (item.boostContext === "mezoVeBtcPairBoost") {
      return selected.has("boostPair")
    }
    return selected.has("boostMatchbox") || selected.has("boostPair")
  }
  return false
}

function filterWalletItems(
  items: MezoActivityItem[],
  filters: MezoActivityFilter[] | undefined,
): MezoActivityItem[] {
  // No filters prop → show all (drawer preview). Empty array → show none.
  if (filters === undefined) return items
  if (filters.length === 0) return []
  const selected = new Set(filters)
  return items.filter((item) => matchesWalletFilter(item, selected))
}

export function useWalletTransactions({
  actor,
  filters,
  fromTimestamp,
  toTimestamp,
  page = 0,
  limit = 50,
  actionTypes = WALLET_ACTION_TYPES_GRAPHQL,
}: UseWalletTransactionsParams) {
  const { chainId, isNetworkReady } = useNetwork()
  const network = NETWORK_BY_CHAIN[chainId]
  const actionTypesKey = [...actionTypes].sort().join(",")

  const query = useQuery({
    queryKey: [
      "wallet-transactions",
      network,
      actor,
      fromTimestamp,
      toTimestamp,
      limit,
      page,
      actionTypesKey,
    ],
    enabled: isNetworkReady && !!network && !!actor,
    queryFn: async () => {
      if (!actor) throw new Error("Actor address required")
      const params = new URLSearchParams()
      if (network) params.set("network", network)
      params.set("actor", actor)
      params.set("limit", String(limit))
      params.set("page", String(page))
      if (fromTimestamp !== undefined) params.set("from", String(fromTimestamp))
      if (toTimestamp !== undefined) params.set("to", String(toTimestamp))
      if (actionTypes.length > 0) {
        params.set("actionTypes", actionTypes.join(","))
      }
      const response = await fetch(`/api/activity?${params.toString()}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.status}`)
      }
      const json = (await response.json()) as MezoActivityApiResponse
      if (!json.success) throw new Error("Activity API reported failure")
      return {
        data: json.data.map(deserializeActivityItem),
        hasMore: json.hasMore,
        page: json.page,
        meta: json.meta,
      }
    },
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  const items = query.data?.data ?? []
  const filteredData = useMemo(
    () => filterWalletItems(items, filters),
    [items, filters],
  )

  return {
    ...query,
    data: filteredData,
    rawData: items,
    hasMore: query.data?.hasMore ?? false,
    page: query.data?.page ?? page,
    meta: query.data?.meta,
  }
}
