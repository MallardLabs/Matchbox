import { usePreviewMode } from "@/contexts/PreviewModeContext"

type FetchStatus = "loading" | "success" | "error"

type VeSupplyBigintResult = {
  /** Effective veBTC supply: override when preview is active, else live. */
  veBTCSupply: bigint | undefined
  /** Effective veMEZO supply: override when preview is active, else live. */
  veMEZOSupply: bigint | undefined
  fetchStatus: FetchStatus
  /** True when the returned values are simulated, not on-chain. */
  isSimulated: boolean
  /** Forwarded refetch for the underlying `supply()` reads. */
  refetch: () => Promise<unknown>
}

/**
 * Effective bigint veBTC / veMEZO system totals, honoring the preview-mode
 * override. Drop-in replacement for the inline `supply()` reads elsewhere in
 * the app so simulation propagates to boost / optimal-veMEZO math everywhere.
 */
export function useVeSupplyBigint(): VeSupplyBigintResult {
  const {
    enabled,
    veBTCOverride,
    veMEZOOverride,
    realVeBTCSupply,
    realVeMEZOSupply,
    fetchStatus,
    refetchReal,
  } = usePreviewMode()

  const simulatingBtc = enabled && veBTCOverride !== undefined
  const simulatingMezo = enabled && veMEZOOverride !== undefined

  return {
    veBTCSupply: simulatingBtc ? veBTCOverride : realVeBTCSupply,
    veMEZOSupply: simulatingMezo ? veMEZOOverride : realVeMEZOSupply,
    fetchStatus,
    isSimulated: simulatingBtc || simulatingMezo,
    refetch: refetchReal,
  }
}
