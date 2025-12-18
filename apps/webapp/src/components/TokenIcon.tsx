const TOKEN_ICON_MAP: Record<string, string> = {
  BTC: "/token icons/Bitcoin.svg",
  WBTC: "/token icons/Bitcoin.svg",
  TBTC: "/token icons/Bitcoin.svg",
  MEZO: "/token icons/Mezo.svg",
}

type TokenIconProps = {
  symbol?: string
  size?: number
  className?: string
}

export function TokenIcon({
  symbol,
  size = 20,
  className = "",
}: TokenIconProps): JSX.Element {
  const iconPath = symbol ? TOKEN_ICON_MAP[symbol.toUpperCase()] : undefined
  const fallbackLabel = symbol?.slice(0, 1)?.toUpperCase() ?? "?"

  if (iconPath) {
    return (
      <img
        src={iconPath}
        alt={`${symbol} icon`}
        width={size}
        height={size}
        className={`inline-block flex-shrink-0 align-middle ${className}`}
      />
    )
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-[var(--surface-secondary)] text-2xs font-semibold text-[var(--content-secondary)] ${className}`}
      style={{ width: size, height: size }}
      aria-label={`${symbol ?? "token"} icon`}
    >
      {fallbackLabel}
    </div>
  )
}
