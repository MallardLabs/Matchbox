import { cn } from "@/utils/cn"

const tokenStyles: Record<string, string> = {
  BTC: "bg-[#f7931a] text-[#1b1208]",
  WBTC: "bg-[#f1a33c] text-[#1b1208]",
  MUSD: "bg-[#d7f5e1] text-[#124f2b]",
  USDC: "bg-[#2775ca] text-white",
  mUSDC: "bg-[#3f8de4] text-white",
  WETH: "bg-[#d7d9e7] text-[#303247]",
  mETH: "bg-[#c9cce0] text-[#303247]",
  MEZO: "bg-[#f7931a] text-[#1b1208]",
  veBTC: "bg-[#e6e1d8] text-[#27231e]",
}

export function TokenMark({
  token,
  className,
}: { token: string; className?: string }) {
  return (
    <span
      aria-label={token}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-black/10 font-mono text-[10px] font-semibold",
        tokenStyles[token] ?? "bg-subtle text-ink",
        className,
      )}
      title={token}
    >
      {token.length > 4 ? token.slice(0, 3) : token}
    </span>
  )
}
