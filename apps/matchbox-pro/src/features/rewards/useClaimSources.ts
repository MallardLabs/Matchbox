import { useClaimable } from "@/hooks/useClaimable"
import { useVeBTCLocks, useVeMEZOLocks } from "@/hooks/useLocks"
import { useBtcPrice, useMezoPrice } from "@/hooks/usePrices"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { referencePriceUsd, tokenUsdMicro } from "@/lib/tokenUsd"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { usePublicClient } from "wagmi"
import {
  type ClaimSource,
  type TokenTotal,
  buildBoostSources,
  buildSources,
  pricedUsd,
  sortSources,
  sourceTokens,
} from "./claimSources"
import { readVeBtcClaimables } from "./veBtcClaimable"

export type ClaimSourcesStatus = "loading" | "ready" | "error"

export type ClaimSourcesResult = {
  status: ClaimSourcesStatus
  sources: ClaimSource[]
  tokens: TokenTotal[]
  /** Priced claimable total, micro-USD. */
  usdMicro: bigint
  unpriced: number
  /** Some reads failed: the total is a lower bound. */
  incomplete: boolean
  isFetching: boolean
  refetch: () => void
}

export const VEBTC_CLAIMABLE_KEY = "vebtc-claimable"

/**
 * Claimable voting incentives for the viewer (connected or watched wallet):
 * veMEZO boost bribes plus veBTC pool fees/bribes and validator bribes, one
 * source per voter contract and lock. Each source is one signature.
 */
export function useClaimSources(): ClaimSourcesResult {
  const { chainId } = useNetwork()
  const client = usePublicClient({ chainId })
  const { data: btcPrice = null } = useBtcPrice()
  const { data: mezoPrice = null } = useMezoPrice()

  const mezoLocks = useVeMEZOLocks()
  const mezoIds = useMemo(
    () => mezoLocks.locks.map((lock) => lock.tokenId),
    [mezoLocks.locks],
  )
  const claimable = useClaimable(mezoIds)

  const btcLocks = useVeBTCLocks()
  const btcIds = useMemo(
    () => btcLocks.locks.map((lock) => lock.tokenId),
    [btcLocks.locks],
  )
  const btcKey = btcIds.map(String).sort().join(",")
  const veBtc = useQuery({
    queryKey: [VEBTC_CLAIMABLE_KEY, chainId, btcKey],
    enabled: !!client && btcIds.length > 0,
    ...QUERY_PROFILES.SHORT_CACHE,
    queryFn: () => {
      if (!client) throw new Error("Network unavailable")
      return readVeBtcClaimables(client, chainId, btcIds)
    },
  })

  const sources = useMemo(() => {
    const priced = (veBtc.data?.rows ?? []).map((row) => ({
      ...row,
      tokens: row.tokens.map((token) => ({
        ...token,
        usdMicro:
          referencePriceUsd({
            tokenAddress: token.token,
            symbol: token.symbol,
            btcPriceUsd: btcPrice,
            mezoPriceUsd: mezoPrice,
          }) === null
            ? null
            : tokenUsdMicro({
                amount: token.amount,
                decimals: token.decimals,
                tokenAddress: token.token,
                symbol: token.symbol,
                btcPriceUsd: btcPrice,
                mezoPriceUsd: mezoPrice,
              }),
      })),
    }))
    return sortSources([
      ...buildBoostSources(claimable.rows),
      ...buildSources(priced),
    ])
  }, [btcPrice, claimable.rows, mezoPrice, veBtc.data])
  const tokens = useMemo(() => sourceTokens(sources), [sources])

  const loading =
    mezoLocks.isLoading ||
    claimable.isLoading ||
    btcLocks.isLoading ||
    (btcIds.length > 0 && veBtc.isLoading)
  const failedBoost = !!(mezoLocks.error ?? claimable.error)
  const failedVeBtc = !!(btcLocks.error ?? veBtc.error)

  return {
    // veMEZO and veBTC fail independently: show what loaded, flag the rest.
    status: loading
      ? "loading"
      : failedBoost && (failedVeBtc || btcIds.length === 0)
        ? "error"
        : "ready",
    sources,
    tokens,
    usdMicro: pricedUsd(tokens),
    unpriced: tokens.filter((token) => token.usdMicro === null).length,
    incomplete:
      claimable.failedReads > 0 ||
      (veBtc.data?.failed ?? 0) > 0 ||
      failedBoost ||
      failedVeBtc,
    isFetching: claimable.isFetching || veBtc.isFetching,
    refetch: () => {
      void mezoLocks.refetch()
      void claimable.refetch()
      void btcLocks.refetch()
      void veBtc.refetch()
    },
  }
}
