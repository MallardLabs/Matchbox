import { getTokenPriceType } from "@repo/shared"
import { cn } from "@repo/ui/cn"
import * as TokenMark from "@repo/ui/token-mark"
import type { ReactElement } from "react"
import type { TargetMark } from "./model"

function tokenKind(
  address: string,
  symbol: string,
): TokenMark.TokenKind | null {
  const kind = getTokenPriceType(address, symbol)
  if (kind === "btc-pegged") return "btc"
  if (kind === "mezo") return "mezo"
  if (symbol.toUpperCase() === "MUSD") return "musd"
  return null
}

function TokenDisc({
  token,
  size,
  overlap = false,
}: {
  token: { symbol: string; address: string }
  size: number
  overlap?: boolean
}): ReactElement {
  const kind = tokenKind(token.address, token.symbol)
  const className = cn("ring-2 ring-surface", overlap && "relative")
  const style = overlap ? { marginLeft: -Math.round(size * 0.4) } : undefined
  return kind ? (
    <TokenMark.Root
      kind={kind}
      size={size}
      className={className}
      style={style}
    />
  ) : (
    <TokenMark.Monogram
      name={token.symbol}
      seed={token.address}
      size={size}
      className={className}
      style={style}
    />
  )
}

/** Gauge picture, monogram for unclaimed gauges, or a token pair for pools. */
export default function TargetAvatar({
  mark,
  size,
}: {
  mark: TargetMark
  size: number
}): ReactElement {
  if (mark.kind === "image")
    return (
      <img
        src={mark.url}
        alt=""
        loading="lazy"
        width={size}
        height={size}
        className="shrink-0 rounded-full bg-inset object-cover"
        style={{ width: size, height: size }}
      />
    )
  if (mark.kind === "pair") {
    const [first, second] = mark.tokens
    return (
      <span aria-hidden="true" className="flex shrink-0 items-center">
        {first ? <TokenDisc token={first} size={size} /> : null}
        {second ? <TokenDisc token={second} size={size} overlap /> : null}
      </span>
    )
  }
  return <TokenMark.Monogram name={mark.name} seed={mark.seed} size={size} />
}
