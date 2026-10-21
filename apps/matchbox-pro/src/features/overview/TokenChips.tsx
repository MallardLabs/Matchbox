import type { TokenTotal } from "@/features/rewards/claimSources"
import { formatRewardAmount } from "@/lib/overview"
import { cn } from "@repo/ui/cn"
import * as TokenMark from "@repo/ui/token-mark"
import type { ReactElement } from "react"

function markKind(symbol: string): TokenMark.TokenKind | null {
  if (/btc/i.test(symbol)) return "btc"
  if (/^mezo$/i.test(symbol)) return "mezo"
  if (/musd/i.test(symbol)) return "musd"
  return null
}

/** Native reward amounts with their token marks ("8,240.6 MEZO"). */
export default function TokenChips({
  tokens,
  size = "sm",
  className,
}: {
  tokens: TokenTotal[]
  size?: "sm" | "md"
  className?: string
}): ReactElement {
  return (
    <ul
      className={cn(
        "m-0 flex list-none flex-wrap items-center p-0",
        size === "md" ? "gap-x-3 gap-y-1" : "gap-x-2.5 gap-y-1",
        className,
      )}
    >
      {tokens.map((token) => {
        const kind = markKind(token.symbol)
        const mark = size === "md" ? 14 : 12
        return (
          <li
            key={token.token}
            className={cn(
              "flex items-center tabular-nums",
              size === "md"
                ? "gap-[5px] text-label font-500 text-secondary"
                : "gap-1 text-caption font-500 text-ink-2",
            )}
          >
            {kind ? (
              <TokenMark.Root kind={kind} size={mark} />
            ) : (
              <TokenMark.Monogram
                name={token.symbol}
                seed={token.token}
                size={mark}
              />
            )}
            {formatRewardAmount(token.amount, token.decimals, token.symbol)}{" "}
            {token.symbol}
          </li>
        )
      })}
    </ul>
  )
}
