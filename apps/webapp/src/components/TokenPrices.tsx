import { useStyletron } from "@mezo-org/mezo-clay"
import { useBtcPrice } from "@/hooks/useBtcPrice"

// Feature flags for token prices
const SHOW_MEZO_PRICE = true // Set to true when MEZO price oracle is available

// Placeholder value for MEZO token price (used when SHOW_MEZO_PRICE is true but no oracle)
// Set to null to show loading state, or a number to show a placeholder price
const MEZO_PLACEHOLDER_PRICE: number | null = 0.22

function formatPrice(price: number | null): string {
  if (price === null) return "—"
  
  // Format with commas and 2 decimal places for large numbers
  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }
  
  // For smaller prices, show more precision
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

type TokenPriceItemProps = {
  icon: string
  symbol: string
  price: number | null
  isLoading?: boolean
  isUnavailable?: boolean
}

function TokenPriceItem({ icon, symbol, price, isLoading, isUnavailable }: TokenPriceItemProps) {
  const [css, theme] = useStyletron()

  return (
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 12px",
        borderRadius: "8px",
        backgroundColor: theme.colors.backgroundSecondary,
        transition: "background-color 0.2s ease",
      })}
      title={isUnavailable ? `${symbol} price unavailable` : `${symbol} price`}
    >
      <img
        src={icon}
        alt={symbol}
        className={css({
          width: "20px",
          height: "20px",
          borderRadius: "50%",
        })}
      />
      <span
        className={css({
          fontFamily: "'Riforma LL', system-ui, sans-serif",
          fontSize: "14px",
          fontWeight: 500,
          color: isLoading || isUnavailable 
            ? theme.colors.contentTertiary 
            : theme.colors.contentPrimary,
          whiteSpace: "nowrap",
        })}
      >
        {isLoading ? (
          "..."
        ) : isUnavailable ? (
          "N/A"
        ) : (
          `$${formatPrice(price)}`
        )}
      </span>
    </div>
  )
}

export function TokenPrices() {
  const [css] = useStyletron()
  const { price: btcPrice, isLoading: btcLoading } = useBtcPrice()

  // TODO: Replace with actual MEZO price hook when oracle is available
  const mezoPrice = MEZO_PLACEHOLDER_PRICE
  const mezoLoading = false

  return (
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "8px",
      })}
    >
      <TokenPriceItem
        icon="/token icons/Bitcoin.svg"
        symbol="BTC"
        price={btcPrice}
        isLoading={btcLoading}
      />
      {SHOW_MEZO_PRICE && (
        <TokenPriceItem
          icon="/token icons/Mezo.svg"
          symbol="MEZO"
          price={mezoPrice}
          isLoading={mezoLoading}
          isUnavailable={mezoPrice === null && !mezoLoading}
        />
      )}
    </div>
  )
}

