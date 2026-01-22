import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useMezoPrice } from "@/hooks/useMezoPrice"

const SHOW_MEZO_PRICE = true

function formatPrice(price: number | null): string {
  if (price === null) return "—"

  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

interface TokenPriceItemProps {
  icon: string
  symbol: string
  price: number | null
  isLoading?: boolean
  isUnavailable?: boolean
}

function TokenPriceItem({
  icon,
  symbol,
  price,
  isLoading,
  isUnavailable,
}: TokenPriceItemProps): JSX.Element {
  return (
    <div
      className="flex items-center gap-2 rounded-lg bg-[var(--surface-secondary)] px-3 py-1.5 transition-colors"
      title={isUnavailable ? `${symbol} price unavailable` : `${symbol} price`}
    >
      <img
        src={icon}
        alt={symbol}
        width={20}
        height={20}
        className="h-5 w-5 rounded-full"
      />
      <span
        className={`whitespace-nowrap font-mono text-sm tabular-nums ${
          isLoading || isUnavailable
            ? "text-[var(--content-tertiary)]"
            : "text-[var(--content-primary)]"
        }`}
      >
        {isLoading ? "..." : isUnavailable ? "N/A" : `$${formatPrice(price)}`}
      </span>
    </div>
  )
}

export function TokenPrices(): JSX.Element {
  const { price: btcPrice, isLoading: btcLoading } = useBtcPrice()
  const {
    price: mezoPrice,
    isLoading: mezoLoading,
    isError: mezoError,
  } = useMezoPrice()

  return (
    <div className="flex items-center gap-2">
      {SHOW_MEZO_PRICE && (
        <TokenPriceItem
          icon="/token icons/Mezo.svg"
          symbol="MEZO"
          price={mezoPrice}
          isLoading={mezoLoading}
          isUnavailable={mezoError || (mezoPrice === null && !mezoLoading)}
        />
      )}
      <TokenPriceItem
        icon="/token icons/Bitcoin.svg"
        symbol="BTC"
        price={btcPrice}
        isLoading={btcLoading}
      />
    </div>
  )
}
