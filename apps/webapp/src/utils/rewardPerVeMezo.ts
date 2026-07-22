import { decimalToScaledBigInt, formatMicroUsd } from "./validatorApy"

const TEN_THOUSAND_VE_MEZO_WEI = 10_000n * 10n ** 18n

export function calculateRewardPer10kVeMezo(
  totalIncentivesUsd: string,
  currentVeMezoWeightWei: bigint | undefined,
): bigint | null {
  if (currentVeMezoWeightWei === undefined) return null
  const incentivePotMicroUsd = decimalToScaledBigInt(totalIncentivesUsd, 6)
  if (incentivePotMicroUsd <= 0n) return 0n
  return (
    (incentivePotMicroUsd * TEN_THOUSAND_VE_MEZO_WEI) /
    (currentVeMezoWeightWei + TEN_THOUSAND_VE_MEZO_WEI)
  )
}

export function formatRewardPer10kVeMezo(value: bigint | null): string {
  if (value === null) return "— / 10k veMEZO"
  return `${formatMicroUsd(value).replace("~", "")} / 10k veMEZO`
}
