import { useNetwork } from "@/contexts/NetworkContext"
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
  const url = `/api/votables?network=${network}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch votables: ${response.status}`)
  }
  const json = (await response.json()) as VotablesResponse
  if (!json.success) throw new Error("API reported failure for /votables")
  return json.data
}

export type PoolVotableSummary = {
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

export function useVotables() {
  const { chainId, isNetworkReady } = useNetwork()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["votables", chainId],
    queryFn: () => fetchVotables(chainId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: isNetworkReady,
  })

  // Map by pool address (target.id), lowercased.
  const byPool = useMemo(() => {
    const m = new Map<string, PoolVotableSummary>()
    for (const v of data ?? []) {
      if (v.target?.type !== "pool") continue
      const voterFeesUsd = v.stats.gaugeFees.reduce(
        (a, t) => a + Number.parseFloat(t.amountUSD || "0"),
        0,
      )
      const bribesUsd = v.stats.bribes.reduce(
        (a, t) => a + Number.parseFloat(t.amountUSD || "0"),
        0,
      )
      m.set(v.target.id.toLowerCase(), {
        gauge: v.gauge,
        votingApr: v.stats.votingApr ?? 0,
        voterFeesUsd,
        voterFees: v.stats.gaugeFees,
        bribesUsd,
        bribes: v.stats.bribes,
        totalVoterIncentivesUsd: voterFeesUsd + bribesUsd,
      })
    }
    return m
  }, [data])

  return {
    votables: data ?? [],
    byPool,
    isLoading,
    error: error as Error | null,
    refetch,
  }
}
