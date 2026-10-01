import { formatTickerUsd } from "@/lib/money"
import { useEpoch } from "./useEpoch"
import { useBtcPrice, useMezoPrice } from "./usePrices"

export function useMarketTicker(): {
  btc: string
  mezo: string
  epoch: string
} {
  const { data: btcPrice } = useBtcPrice()
  const { data: mezoPrice } = useMezoPrice()
  const { label: epoch } = useEpoch()
  return {
    btc: formatTickerUsd(btcPrice, 2),
    mezo: formatTickerUsd(mezoPrice, 4),
    epoch,
  }
}
