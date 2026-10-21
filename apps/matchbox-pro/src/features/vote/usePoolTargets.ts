import { useEpoch } from "@/hooks/useEpoch"
import { formatMicroUsd } from "@/lib/money"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { shortenAddress } from "@repo/ui/wallet-address"
import { useMemo } from "react"
import { type Address, getAddress, isAddress, zeroAddress } from "viem"
import { useReadContracts } from "wagmi"
import { TOKEN_META_ABI, voterConfig } from "./contracts"
import type { VoteTarget } from "./model"
import {
  INFINITE_APY,
  PER_VEBTC,
  type Prices,
  formatShare,
  formatVeBtc,
  priceRewards,
  rewardPerUnit,
  shareBps,
  shareFooter,
  sumPriced,
  targetApy,
} from "./targets"
import { useEpochRewards } from "./useEpochRewards"

function asAddress(value: unknown): Address | undefined {
  if (typeof value !== "string" || !isAddress(value, { strict: false }))
    return undefined
  const address = getAddress(value)
  return address === zeroAddress ? undefined : address
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined
}

/**
 * PoolsVoter targets are pools and vaults (not gauges): `vote`, `votes` and
 * `weights` take the target; `isAlive` and the reward lookups take its gauge.
 * Voters earn the gauge's fee reward (last epoch's trading fees) plus bribes.
 */
export function usePoolTargets(prices: Prices): {
  targets: VoteTarget[]
  isLoading: boolean
  incentivesLoading: boolean
} {
  const { chainId } = useNetwork()
  const voter = voterConfig(chainId, "pools")
  const { epochStart } = useEpoch()

  const head = useReadContracts({
    contracts: [
      { ...voter, functionName: "length" as const },
      { ...voter, functionName: "totalWeight" as const },
    ],
    query: QUERY_PROFILES.SHORT_CACHE,
  })
  const length =
    typeof head.data?.[0]?.result === "bigint" ? head.data[0].result : 0n
  const totalWeight =
    typeof head.data?.[1]?.result === "bigint" ? head.data[1].result : 0n

  const poolRead = useReadContracts({
    contracts: Array.from({ length: Number(length) }, (_, index) => ({
      ...voter,
      functionName: "pools" as const,
      args: [BigInt(index)] as const,
    })),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: length > 0n },
  })
  const pools = useMemo(
    () =>
      poolRead.data?.flatMap((row) => {
        const address = asAddress(row.result)
        return address ? [address] : []
      }) ?? [],
    [poolRead.data],
  )

  const gaugeRead = useReadContracts({
    contracts: pools.flatMap((pool) => [
      { ...voter, functionName: "gauges" as const, args: [pool] as const },
      { ...voter, functionName: "weights" as const, args: [pool] as const },
    ]),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: pools.length > 0 },
  })
  const withGauges = useMemo(
    () =>
      pools.flatMap((pool, index) => {
        const gauge = asAddress(gaugeRead.data?.[index * 2]?.result)
        const weight = gaugeRead.data?.[index * 2 + 1]?.result
        return gauge
          ? [{ pool, gauge, weight: typeof weight === "bigint" ? weight : 0n }]
          : []
      }),
    [gaugeRead.data, pools],
  )

  const stateRead = useReadContracts({
    contracts: withGauges.flatMap(({ gauge }) => [
      { ...voter, functionName: "isAlive" as const, args: [gauge] as const },
      {
        ...voter,
        functionName: "gaugeToBribe" as const,
        args: [gauge] as const,
      },
      {
        ...voter,
        functionName: "gaugeToFees" as const,
        args: [gauge] as const,
      },
    ]),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: withGauges.length > 0 },
  })

  const metaRead = useReadContracts({
    contracts: withGauges.flatMap(({ pool }) => [
      {
        address: pool,
        abi: TOKEN_META_ABI,
        chainId,
        functionName: "name" as const,
      },
      {
        address: pool,
        abi: TOKEN_META_ABI,
        chainId,
        functionName: "symbol" as const,
      },
      {
        address: pool,
        abi: TOKEN_META_ABI,
        chainId,
        functionName: "token0" as const,
      },
      {
        address: pool,
        abi: TOKEN_META_ABI,
        chainId,
        functionName: "token1" as const,
      },
    ]),
    query: { ...QUERY_PROFILES.LONG_CACHE, enabled: withGauges.length > 0 },
  })
  const pairTokens = useMemo(() => {
    const set = new Map<string, Address>()
    withGauges.forEach((_, index) => {
      for (const offset of [2, 3]) {
        const token = asAddress(metaRead.data?.[index * 4 + offset]?.result)
        if (token) set.set(token.toLowerCase(), token)
      }
    })
    return [...set.values()]
  }, [metaRead.data, withGauges])
  const pairSymbols = useReadContracts({
    contracts: pairTokens.map((address) => ({
      address,
      abi: TOKEN_META_ABI,
      chainId,
      functionName: "symbol" as const,
    })),
    query: { ...QUERY_PROFILES.LONG_CACHE, enabled: pairTokens.length > 0 },
  })

  const rows = useMemo(
    () =>
      withGauges.map((entry, index) => ({
        ...entry,
        isAlive: stateRead.data?.[index * 3]?.result === true,
        bribe: asAddress(stateRead.data?.[index * 3 + 1]?.result),
        fees: asAddress(stateRead.data?.[index * 3 + 2]?.result),
      })),
    [stateRead.data, withGauges],
  )
  const rewardContracts = useMemo(
    () =>
      rows.flatMap((row) =>
        [row.bribe, row.fees].flatMap((address) => (address ? [address] : [])),
      ),
    [rows],
  )
  const rewards = useEpochRewards(rewardContracts, epochStart)

  const targets = useMemo(() => {
    const symbolByToken = new Map(
      pairTokens.map((address, index) => [
        address.toLowerCase(),
        asString(pairSymbols.data?.[index]?.result) ?? shortenAddress(address),
      ]),
    )
    return rows.map((row, index): VoteTarget => {
      const lpName = asString(metaRead.data?.[index * 4]?.result)
      const lpSymbol = asString(metaRead.data?.[index * 4 + 1]?.result)
      const token0 = asAddress(metaRead.data?.[index * 4 + 2]?.result)
      const token1 = asAddress(metaRead.data?.[index * 4 + 3]?.result)
      const pair =
        token0 && token1
          ? [token0, token1].map((address) => ({
              address,
              symbol: symbolByToken.get(address.toLowerCase()) ?? "?",
            }))
          : null
      const name = pair
        ? `${pair[0]?.symbol} / ${pair[1]?.symbol}`
        : (lpName ?? lpSymbol ?? shortenAddress(row.pool))
      const fees = priceRewards(
        row.fees ? (rewards.byContract.get(row.fees.toLowerCase()) ?? []) : [],
        prices,
      )
      const bribes = priceRewards(
        row.bribe
          ? (rewards.byContract.get(row.bribe.toLowerCase()) ?? [])
          : [],
        prices,
      )
      const all = [...fees, ...bribes]
      const { microUsd, hasUnpriced } = sumPriced(all)
      const feeTotal = sumPriced(fees)
      const bribeTotal = sumPriced(bribes)
      const apyBps = targetApy(microUsd, row.weight, prices.btc)
      const share = shareFooter(row.weight, totalWeight)
      return {
        id: row.pool,
        name,
        description: pair ? (lpSymbol ?? null) : `Vault · ${lpSymbol ?? "—"}`,
        mark: pair
          ? { kind: "pair", tokens: pair }
          : { kind: "monogram", name, seed: row.pool },
        chip: null,
        isAlive: row.isAlive,
        needsBoost: false,
        totalWeight: row.weight,
        rewards: all,
        incentiveMicroUsd: microUsd,
        hasUnpriced,
        apyBps,
        perUnitMicroUsd:
          microUsd > 0n ? rewardPerUnit(microUsd, row.weight, PER_VEBTC) : null,
        stats: [
          { label: "Votes", value: formatVeBtc(row.weight) },
          { label: "Share", value: formatShare(row.weight, totalWeight) },
        ],
        footer: {
          ...share,
          label: "Fees",
          value:
            fees.length === 0
              ? "$0.00"
              : feeTotal.hasUnpriced && feeTotal.microUsd === 0n
                ? "Unpriced"
                : formatMicroUsd(feeTotal.microUsd),
          side: {
            text: `Incentives ${
              bribeTotal.hasUnpriced && bribeTotal.microUsd === 0n
                ? "unpriced"
                : formatMicroUsd(bribeTotal.microUsd)
            }`,
            tone: "muted",
          },
        },
        sortValues: {
          apy: apyBps === -1n ? INFINITE_APY : (apyBps ?? 0n),
          incentives: microUsd,
          votes: row.weight,
          share: shareBps(row.weight, totalWeight),
        },
        searchText: [name, lpSymbol ?? "", lpName ?? "", row.pool, row.gauge]
          .join(" ")
          .toLowerCase(),
        hasDetail: false,
      }
    })
  }, [
    metaRead.data,
    pairSymbols.data,
    pairTokens,
    prices,
    rewards.byContract,
    rows,
    totalWeight,
  ])

  return {
    targets,
    isLoading: head.isLoading || poolRead.isLoading || gaugeRead.isLoading,
    incentivesLoading: rewards.isLoading || stateRead.isLoading,
  }
}
