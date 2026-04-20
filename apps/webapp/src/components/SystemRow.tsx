import { TokenIcon } from "@/components/TokenIcon"
import { useEffect, useState } from "react"

export const formatNumber = (num: number | string, maxDecimals = 2): string => {
  if (num === "" || num === undefined || num === null) return ""
  const n = typeof num === "string" ? Number.parseFloat(num) : num
  if (Number.isNaN(n)) return ""

  // Scale decimal places based on magnitude so small values (e.g. 0.00012 BTC) don't round to 0
  const abs = Math.abs(n)
  let decimals = maxDecimals
  if (abs > 0 && abs < 1) {
    const leadingZeros = Math.max(0, -Math.floor(Math.log10(abs)))
    decimals = Math.min(8, leadingZeros + 2)
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(n)
}

export const parseNumber = (str: string): number => {
  const cleanStr = str.replace(/,/g, "")
  const num = Number.parseFloat(cleanStr)
  return Number.isNaN(num) ? 0 : num
}

export const parseCompact = (str: string): number => {
  if (!str) return 0
  const cleanStr = str.replace(/,/g, "").trim().toUpperCase()
  const match = cleanStr.match(/^(-?\d+\.?\d*)(B|M|K)?$/)
  if (!match) return parseNumber(str)
  const value = Number.parseFloat(match[1] ?? "0")
  const suffix = match[2]
  if (Number.isNaN(value)) return 0
  switch (suffix) {
    case "B":
      return value * 1_000_000_000
    case "M":
      return value * 1_000_000
    case "K":
      return value * 1_000
    default:
      return value
  }
}

export const formatCompact = (num: number): string => {
  const absNum = Math.abs(num)
  const sign = num < 0 ? "-" : ""
  if (absNum >= 1_000_000_000) {
    const val = absNum / 1_000_000_000
    return `${sign}${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1).replace(/\.0$/, "")}B`
  }
  if (absNum >= 1_000_000) {
    const val = absNum / 1_000_000
    return `${sign}${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1).replace(/\.0$/, "")}M`
  }
  if (absNum >= 1_000) {
    const val = absNum / 1_000
    return `${sign}${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1).replace(/\.0$/, "")}K`
  }
  return formatNumber(num)
}

interface SystemRowProps {
  label: string
  tokenSymbol: "BTC" | "MEZO"
  value: number
  max: number
  onValueChange: (val: number) => void
  onMaxChange: (val: number) => void
}

export default function SystemRow({
  label,
  tokenSymbol,
  value,
  max,
  onValueChange,
  onMaxChange,
}: SystemRowProps) {
  const [maxInput, setMaxInput] = useState(formatCompact(max))
  const [isMaxFocused, setIsMaxFocused] = useState(false)

  useEffect(() => {
    if (!isMaxFocused) {
      setMaxInput(formatCompact(max))
    }
  }, [max, isMaxFocused])

  const handleMaxBlur = () => {
    setIsMaxFocused(false)
    const parsed = parseCompact(maxInput)
    onMaxChange(parsed)
    setMaxInput(formatCompact(parsed))
  }

  const percentage = max > 0 ? (value / max) * 100 : 0

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between sm:mb-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-[var(--content-primary)] sm:gap-2 sm:text-sm">
          <TokenIcon symbol={tokenSymbol} size={16} className="opacity-70" />
          {label}
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={formatNumber(value)}
          onChange={(e) => onValueChange(parseNumber(e.target.value))}
          className="w-24 border-b border-transparent bg-transparent p-0 text-right font-mono text-xs font-semibold tabular-nums tracking-tight text-[var(--content-secondary)] transition-colors hover:border-[var(--border)] focus:border-[#F7931A] focus:text-[var(--content-primary)] focus:outline-none sm:w-32 sm:text-sm"
        />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex h-10 flex-1 touch-none select-none items-center">
          <div className="pointer-events-none absolute left-3 right-3 h-2 overflow-hidden rounded-full bg-[var(--surface-tertiary)]">
            <div
              className="h-full bg-gradient-to-r from-[#F7931A] to-[#FFB347] transition-all duration-75"
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={max}
            step={max / 1000}
            value={value}
            onChange={(e) => onValueChange(Number.parseFloat(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <div
            className="pointer-events-none absolute z-10 h-5 w-5 rounded-full bg-[#F7931A] shadow-[0_0_10px_rgba(247,147,26,0.5)] ring-2 ring-[#F7931A] transition-all duration-75"
            style={{
              left: `calc(2px + ${Math.min(percentage, 100)}% - ${Math.min(percentage, 100) * 0.24}px)`,
            }}
          />
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[8px] font-semibold uppercase tracking-wider text-[var(--content-secondary)] sm:text-[9px]">
            Max
          </span>
          <input
            type="text"
            inputMode="text"
            value={maxInput}
            onChange={(e) => setMaxInput(e.target.value)}
            onFocus={() => setIsMaxFocused(true)}
            onBlur={handleMaxBlur}
            className="w-14 rounded bg-[var(--surface-tertiary)] px-1 py-0.5 text-right font-mono text-[10px] font-medium text-[var(--content-secondary)] focus:outline-none focus:ring-1 focus:ring-[#F7931A] sm:w-16 sm:px-1.5 sm:text-xs"
          />
        </div>
      </div>
    </div>
  )
}
