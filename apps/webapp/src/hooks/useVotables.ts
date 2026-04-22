import { useNetwork } from "@/contexts/NetworkContext"
import { normalizeVotingAprPercent } from "@/utils/votingApr"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { Address } from "viem"

export type VotableTokenStat = {
  token: Address
  amount: string
  amountUSD: string
}

export type VotableStats = {
  gaugeFees: VotableTokenStat[]
  bribes: VotableTokenStat[]
  votingApr: number
}

export type Votable = {
  id: string
  type: string
  votingBucket: string
  votingContract: Address
  target: { id: Address; type: string }
  stats: VotableStats
  gauge: Address
}

type VotablesResponse = {
  success: boolean
  data: Votable[]
}

const VOTABLES_NETWORK: Record<number, "mainnet" | "testnet"> = {
  [CHAIN_ID.mainnet]: "mainnet",
  [CHAIN_ID.testnet]: "testnet",
}

async function fetchVotables(chainId: number): Promise<Votable[]> {
  const network = VOTABLES_NETWORK[chainId]
  if (!network) throw new Error(`Unsupported chainId ${chainId}`)
  // Per-network path so CDN / browser cache never collapses testnet and
  // mainnet responses together (see `pages/api/votables/[network].ts`).
  const url = `/api/votables/${network}`
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`Failed to fetch votables: ${response.status}`)
  }
  const json = (await response.json()) as VotablesResponse
  if (!json.success) throw new Error("API reported failure for /votables")
  return json.data
}

export type PoolVotableSummary = {
  id: string
  type: string
  votingBucket: string
  votingContract: Address
  targetId: Address
  targetType: string
  gauge: Address
  votingApr: number
  /** Trading fees redirected to voters this epoch (USD). */
  voterFeesUsd: number
  voterFees: VotableTokenStat[]
  /** External bribes posted for this epoch (USD). */
  bribesUsd: number
  bribes: VotableTokenStat[]
  /** voterFeesUsd + bribesUsd */
  totalVoterIncentivesUsd: number
}

export type StandaloneVotableSummary = PoolVotableSummary

export function useVotables() {
  const { chainId, isNetworkReady } = useNetwork()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["votables", chainId],
    queryFn: () => fetchVotables(chainId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: isNetworkReady,
  })

  const summaries = useMemo(
    () =>
      (data ?? []).map((v) => {
        const voterFeesUsd = v.stats.gaugeFees.reduce(
          (a, t) => a + Number.parseFloat(t.amountUSD || "0"),
          0,
        )
        const bribesUsd = v.stats.bribes.reduce(
          (a, t) => a + Number.parseFloat(t.amountUSD || "0"),
          0,
        )

        return {
          id: v.id,
          type: v.type,
          votingBucket: v.votingBucket,
          votingContract: v.votingContract,
          targetId: v.target.id,
          targetType: v.target.type,
          gauge: v.gauge,
          votingApr: normalizeVotingAprPercent(v.stats.votingApr),
          voterFeesUsd,
          voterFees: v.stats.gaugeFees,
          bribesUsd,
          bribes: v.stats.bribes,
          totalVoterIncentivesUsd: voterFeesUsd + bribesUsd,
        } satisfies PoolVotableSummary
      }),
    [data],
  )

  // Map by pool address (target.id), lowercased.
  const byPool = useMemo(() => {
    const m = new Map<string, PoolVotableSummary>()
    for (const summary of summaries) {
      if (summary.targetType !== "pool") continue
      m.set(summary.targetId.toLowerCase(), summary)
    }
    return m
  }, [summaries])

  const standalone = useMemo(
    () => summaries.filter((summary) => summary.targetType !== "pool"),
    [summaries],
  )

  return {
    votables: data ?? [],
    summaries,
    byPool,
    standalone,
    isLoading,
    error: error as Error | null,
    refetch,
  }
}
