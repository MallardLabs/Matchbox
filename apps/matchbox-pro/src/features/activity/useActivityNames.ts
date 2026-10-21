import { useVeBTCLocks, useVeMEZOLocks } from "@/hooks/useLocks"
import { profileForGauge, useGaugeProfiles } from "@/hooks/useProfiles"
import { useTopology } from "@/hooks/useTopology"
import { useCallback, useMemo } from "react"
import type { Escrow, Names, TokenMeta } from "./activityModel"

// Native Mezo tokens whose decimals are fixed; everything else comes from the
// gauge topology's reward-token metadata.
const KNOWN_TOKENS: Record<string, TokenMeta> = {
  "0x7b7c000000000000000000000000000000000000": { symbol: "BTC", decimals: 18 },
  "0x7b7c000000000000000000000000000000000001": {
    symbol: "MEZO",
    decimals: 18,
  },
  "0xdd468a1ddc392dcdbef6db6e34e89aa338f9f186": {
    symbol: "MUSD",
    decimals: 18,
  },
}

/**
 * Gauge display names and token metadata for activity rows. `ownLocks` maps
 * lock ids to the viewer's escrows; only pass it when the rows are the
 * viewer's own (ids overlap across veMEZO and veBTC).
 */
export function useActivityNames(ownLocks: boolean): Names {
  const { data: profiles } = useGaugeProfiles()
  const { data: topology } = useTopology()
  const mezo = useVeMEZOLocks()
  const btc = useVeBTCLocks()

  const lock = useMemo(() => {
    if (!ownLocks) return undefined
    const mezoIds = new Set(mezo.locks.map((item) => item.tokenId))
    const btcIds = new Set(btc.locks.map((item) => item.tokenId))
    return (tokenId: bigint): Escrow | null => {
      const inMezo = mezoIds.has(tokenId)
      const inBtc = btcIds.has(tokenId)
      if (inMezo === inBtc) return null
      return inMezo ? "veMEZO" : "veBTC"
    }
  }, [btc.locks, mezo.locks, ownLocks])

  const tokens = useMemo(() => {
    const map = new Map<string, TokenMeta>(Object.entries(KNOWN_TOKENS))
    for (const gauge of topology?.gauges ?? []) {
      for (const token of gauge.rewardTokens) {
        const key = token.tokenAddress.toLowerCase()
        if (!map.has(key)) {
          map.set(key, { symbol: token.symbol, decimals: token.decimals })
        }
      }
    }
    return map
  }, [topology])

  const gauge = useCallback(
    (address: string) =>
      profileForGauge(profiles, address)?.display_name ?? null,
    [profiles],
  )
  const token = useCallback(
    (address: string) => tokens.get(address.toLowerCase()) ?? null,
    [tokens],
  )

  return useMemo(() => ({ gauge, token, lock }), [gauge, lock, token])
}
