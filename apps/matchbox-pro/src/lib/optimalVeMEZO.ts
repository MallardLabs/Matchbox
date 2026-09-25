/**
 * veMEZO voting weight on a gauge that reaches maximum (5x) boost.
 *   targetVeMEZO = (unboosted NFT veBTC * veMEZO totalVotingPower) / veBTC unboostedTotalVotingPower
 *   additionalVeMEZO = max(targetVeMEZO - currentGaugeVeMEZOWeight, 0)
 */
export default function calculateOptimalVeMEZO(
  gaugeVeBTCWeight: bigint | undefined,
  currentGaugeVeMEZOWeight: bigint,
  veBTCTokenSupply: bigint | undefined,
  veMEZOTokenSupply: bigint | undefined,
): { optimalVeMEZO: bigint; optimalAdditionalVeMEZO: bigint } | undefined {
  if (!veMEZOTokenSupply || !veBTCTokenSupply || !gaugeVeBTCWeight) {
    return undefined
  }
  const optimalVeMEZO =
    (gaugeVeBTCWeight * veMEZOTokenSupply) / veBTCTokenSupply
  return {
    optimalVeMEZO,
    optimalAdditionalVeMEZO:
      optimalVeMEZO > currentGaugeVeMEZOWeight
        ? optimalVeMEZO - currentGaugeVeMEZOWeight
        : 0n,
  }
}
