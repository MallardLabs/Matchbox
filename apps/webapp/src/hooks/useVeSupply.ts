import { useVeSupplyBigint } from "@/hooks/useVeSupplyBigint"

type FetchStatus = "loading" | "success" | "error"

type VeSupplyResult = {
  totalVeBtc: number | undefined
  totalVeMezo: number | undefined
  fetchStatus: FetchStatus
}

/**
 * Live veBTC / veMEZO totals from escrow `supply()` — Boost calculator
 * system defaults. Honors the preview-mode override so simulating a supply
 * flows through here to the standalone BoostCalculator on the /boost page.
 */
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
