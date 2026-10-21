import { useEpoch } from "@/hooks/useEpoch"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { supabase } from "@/lib/supabase"
import { VALIDATOR_POOL_ABI } from "@repo/shared/contracts"
import { shortenAddress } from "@repo/ui/wallet-address"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { type Address, getAddress, isAddress, zeroAddress } from "viem"
import { useReadContract, useReadContracts } from "wagmi"
import { z } from "zod"
import { validatorPoolAddress, voterConfig } from "./contracts"
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

const profileSchema = z.object({
  gauge_address: z.string(),
  operator_address: z.string().nullish(),
  display_name: z.string().nullish(),
  description: z.string().nullish(),
  profile_picture_url: z.string().nullish(),
})
type ValidatorProfile = z.infer<typeof profileSchema>

function asAddress(value: unknown): Address | undefined {
  if (typeof value !== "string" || !isAddress(value, { strict: false }))
    return undefined
  const address = getAddress(value)
  return address === zeroAddress ? undefined : address
}

function useValidatorProfiles(chainId: number) {
  return useQuery({
    queryKey: ["validator-profiles", chainId],
    queryFn: async (): Promise<ValidatorProfile[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from("validator_profiles")
        .select(
          "gauge_address, operator_address, display_name, description, profile_picture_url",
        )
        .eq("chain_id", chainId)
      if (error) throw error
      const parsed = z.array(profileSchema).safeParse(data ?? [])
      return parsed.success ? parsed.data : []
    },
    ...QUERY_PROFILES.LONG_CACHE,
    enabled: Boolean(supabase),
  })
}

/**
 * Validator gauges from ValidatorsVoter (the voter list keeps gauges of
 * validators that left the PoA set), named from the ValidatorPool registry and
 * Supabase `validator_profiles`.
 */
export function useValidatorTargets(prices: Prices): {
  targets: VoteTarget[]
  isLoading: boolean
  incentivesLoading: boolean
} {
  const { chainId } = useNetwork()
  const voter = voterConfig(chainId, "validators")
  const pool = validatorPoolAddress(chainId)
  const { epochStart } = useEpoch()
  const profiles = useValidatorProfiles(chainId)

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

  const gaugeRead = useReadContracts({
    contracts: Array.from({ length: Number(length) }, (_, index) => ({
      ...voter,
      functionName: "gauges" as const,
      args: [BigInt(index)] as const,
    })),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: length > 0n },
  })
  const gauges = useMemo(
    () =>
      gaugeRead.data?.flatMap((row) => {
        const address = asAddress(row.result)
        return address ? [address] : []
      }) ?? [],
    [gaugeRead.data],
  )

  const stateRead = useReadContracts({
    contracts: gauges.flatMap((gauge) => [
      { ...voter, functionName: "weights" as const, args: [gauge] as const },
      { ...voter, functionName: "isAlive" as const, args: [gauge] as const },
      {
        ...voter,
        functionName: "gaugeToBribe" as const,
        args: [gauge] as const,
      },
    ]),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: gauges.length > 0 },
  })

  const operatorsRead = useReadContract({
    address: pool,
    abi: VALIDATOR_POOL_ABI,
    chainId,
    functionName: "validators",
    query: QUERY_PROFILES.LONG_CACHE,
  })
  const operators = useMemo(
    () =>
      (operatorsRead.data ?? []).flatMap((value) => {
        const address = asAddress(value)
        return address ? [address] : []
      }),
    [operatorsRead.data],
  )
  const registryRead = useReadContracts({
    contracts: operators.flatMap((operator) => [
      {
        address: pool,
        abi: VALIDATOR_POOL_ABI,
        chainId,
        functionName: "validator" as const,
        args: [operator] as const,
      },
      {
        ...voter,
        functionName: "validatorToGauge" as const,
        args: [operator] as const,
      },
    ]),
    query: { ...QUERY_PROFILES.LONG_CACHE, enabled: operators.length > 0 },
  })

  const rows = useMemo(
    () =>
      gauges.map((gauge, index) => {
        const weight = stateRead.data?.[index * 3]?.result
        const alive = stateRead.data?.[index * 3 + 1]?.result
        return {
          gauge,
          weight: typeof weight === "bigint" ? weight : 0n,
          isAlive: alive === true,
          bribe: asAddress(stateRead.data?.[index * 3 + 2]?.result),
        }
      }),
    [gauges, stateRead.data],
  )
  const bribes = useMemo(
    () => rows.flatMap((row) => (row.bribe ? [row.bribe] : [])),
    [rows],
  )
  const rewards = useEpochRewards(bribes, epochStart)

  const registry = useMemo(() => {
    const byGauge = new Map<
      string,
      { operator: Address; moniker: string; details: string }
    >()
    operators.forEach((operator, index) => {
      const info = registryRead.data?.[index * 2]?.result
      const gauge = asAddress(registryRead.data?.[index * 2 + 1]?.result)
      if (!gauge) return
      const description =
        Array.isArray(info) && typeof info[1] === "object" ? info[1] : null
      byGauge.set(gauge.toLowerCase(), {
        operator,
        moniker: description?.moniker?.trim() ?? "",
        details: description?.details?.trim() ?? "",
      })
    })
    return byGauge
  }, [operators, registryRead.data])

  const targets = useMemo(() => {
    const profileByGauge = new Map(
      (profiles.data ?? []).map((profile) => [
        profile.gauge_address.toLowerCase(),
        profile,
      ]),
    )
    return rows.map((row): VoteTarget => {
      const key = row.gauge.toLowerCase()
      const profile = profileByGauge.get(key)
      const entry = registry.get(key)
      const operator =
        entry?.operator ?? asAddress(profile?.operator_address ?? undefined)
      const name =
        profile?.display_name?.trim() ||
        entry?.moniker ||
        shortenAddress(operator ?? row.gauge)
      const priced = priceRewards(
        row.bribe
          ? (rewards.byContract.get(row.bribe.toLowerCase()) ?? [])
          : [],
        prices,
      )
      const { microUsd, hasUnpriced } = sumPriced(priced)
      const apyBps = targetApy(microUsd, row.weight, prices.btc)
      const footer = shareFooter(row.weight, totalWeight)
      return {
        id: row.gauge,
        name,
        description: profile?.description?.trim() || entry?.details || null,
        mark: profile?.profile_picture_url
          ? { kind: "image", url: profile.profile_picture_url }
          : { kind: "monogram", name, seed: row.gauge },
        chip: null,
        isAlive: row.isAlive,
        needsBoost: false,
        totalWeight: row.weight,
        rewards: priced,
        incentiveMicroUsd: microUsd,
        hasUnpriced,
        apyBps,
        perUnitMicroUsd:
          microUsd > 0n ? rewardPerUnit(microUsd, row.weight, PER_VEBTC) : null,
        stats: [
          { label: "Votes", value: formatVeBtc(row.weight) },
          { label: "Share", value: formatShare(row.weight, totalWeight) },
        ],
        footer: operator
          ? { ...footer, label: "Operator", value: shortenAddress(operator) }
          : footer,
        sortValues: {
          apy: apyBps === -1n ? INFINITE_APY : (apyBps ?? 0n),
          incentives: microUsd,
          votes: row.weight,
          share: shareBps(row.weight, totalWeight),
        },
        searchText: [name, entry?.moniker ?? "", operator ?? "", row.gauge]
          .join(" ")
          .toLowerCase(),
        hasDetail: false,
      }
    })
  }, [prices, profiles.data, registry, rewards.byContract, rows, totalWeight])

  return {
    targets,
    isLoading: head.isLoading || gaugeRead.isLoading || stateRead.isLoading,
    incentivesLoading: rewards.isLoading,
  }
}
