import { getTokenPriceType } from "@repo/shared"
import { tokenUsdMicroValue } from "./money"

export function referencePriceUsd(input: {
  tokenAddress: string
  symbol: string
  btcPriceUsd: string | null
  mezoPriceUsd: string | null
}): string | null {
  const kind = getTokenPriceType(input.tokenAddress, input.symbol)
  if (kind === "stablecoin") return "1"
  if (kind === "btc-pegged") return input.btcPriceUsd
  if (kind === "mezo") return input.mezoPriceUsd
  return null
}

export function tokenUsdMicro(input: {
  amount: bigint
  decimals: number
  tokenAddress: string
  symbol: string
  btcPriceUsd: string | null
  mezoPriceUsd: string | null
}): bigint {
  const price = referencePriceUsd(input)
  if (!price) return 0n
  return tokenUsdMicroValue(input.amount, input.decimals, price)
}
