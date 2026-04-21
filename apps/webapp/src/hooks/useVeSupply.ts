import { useVeSupplyBigint } from "@/hooks/useVeSupplyBigint"

type FetchStatus = "loading" | "success" | "error"

type VeSupplyResult = {
  totalVeBtc: number | undefined
  totalVeMezo: number | undefined
  fetchStatus: FetchStatus
}

/** Live boost-system totals for Boost calculator defaults. */
export function useVeSupply(): VeSupplyResult {
  const { veBTCSupply, veMEZOSupply, fetchStatus } = useVeSupplyBigint()

  return {
    totalVeBtc:
      veBTCSupply !== undefined ? Number(veBTCSupply) / 1e18 : undefined,
    totalVeMezo:
      veMEZOSupply !== undefined ? Number(veMEZOSupply) / 1e18 : undefined,
    fetchStatus,
  }
}

export default useVeSupply
