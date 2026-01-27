import { TokenIcon } from "@/components/TokenIcon"
import { useCallback, useEffect, useRef, useState } from "react"

type LockState = "NONE" | "MEZO" | "BTC"

const INITIAL_TOTAL_VEMEZO = 30_000_000
const INITIAL_TOTAL_VEBTC = 200
const INITIAL_BTC = "21"
const INITIAL_BOOST = 5.0
const INITIAL_MAX_VEMEZO = 500_000_000
const INITIAL_MAX_VEBTC = 1000

const formatNumber = (num: number | string, maxDecimals = 2): string => {
  if (num === "" || num === undefined || num === null) return ""
  const n = typeof num === "string" ? Number.parseFloat(num) : num
  if (Number.isNaN(n)) return ""
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(n)
}

const parseCompact = (str: string): number => {
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

const formatCompact = (num: number): string => {
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

const parseNumber = (str: string): number => {
  const cleanStr = str.replace(/,/g, "")
  const num = Number.parseFloat(cleanStr)
  return Number.isNaN(num) ? 0 : num
}

const clampBoost = (val: number) => Math.min(5, Math.max(1, val))

const calcInitialMezo = () => {
  const btc = Number.parseFloat(INITIAL_BTC)
  const boostCalc = INITIAL_BOOST - 1
  return (boostCalc * INITIAL_TOTAL_VEMEZO * btc) / (4 * INITIAL_TOTAL_VEBTC)
}

interface InputRowProps {
  value: string
  label: string
  tokenSymbol: "BTC" | "MEZO"
  isLocked: boolean
  readOnly: boolean
  onToggleLock: () => void
  onChange: (val: string) => void
}

function InputRow({
  value,
  label,
  tokenSymbol,
  isLocked,
  readOnly,
  onToggleLock,
  onChange,
}: InputRowProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return
    const raw = e.target.value.replace(/[^0-9.]/g, "")
    if ((raw.match(/\./g) || []).length > 1) return
    onChange(raw)
  }

  return (
    <div
      className={`relative flex h-14 items-center overflow-hidden rounded-xl transition-all duration-200 sm:h-16 ${
        readOnly
          ? "bg-[var(--surface-secondary)] ring-1 ring-[var(--border)]"
          : "bg-[var(--surface-primary)] shadow-[0_0_12px_rgba(247,147,26,0.15)] ring-2 ring-[#F7931A]/30"
      }`}
    >
      <button
        type="button"
        onClick={onToggleLock}
        className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 transition-all duration-200 sm:left-3 sm:p-2 ${
          isLocked
            ? "bg-[var(--surface-tertiary)] text-[var(--content-secondary)] hover:bg-[var(--surface-secondary)]"
            : "bg-[#F7931A] text-white shadow-[0_0_8px_rgba(233,30,99,0.4)] hover:bg-[#E8820C]"
        }`}
        title={
          isLocked ? "Unlock (Enable Editing)" : "Lock (Calculate this value)"
        }
      >
        {isLocked ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
        )}
      </button>

      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        placeholder="0"
        className={`h-full w-full bg-transparent pl-12 pr-[88px] text-right font-mono text-lg font-semibold outline-none transition-colors placeholder:text-[var(--content-secondary)]/50 sm:pl-16 sm:pr-28 sm:text-2xl ${
          readOnly
            ? "cursor-default text-[var(--content-secondary)]"
            : "text-[var(--content-primary)]"
        }`}
      />

      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 sm:right-3">
        <span
          className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold tracking-wide transition-colors sm:gap-1.5 sm:px-2.5 sm:py-1.5 sm:text-xs ${
            readOnly
              ? "bg-[var(--surface-tertiary)] text-[var(--content-secondary)]"
              : "bg-[#F7931A]/10 text-[#F7931A]"
          }`}
        >
          <TokenIcon symbol={tokenSymbol} size={14} className="opacity-80" />
          {label}
        </span>
      </div>
    </div>
  )
}

interface SystemRowProps {
  label: string
  tokenSymbol: "BTC" | "MEZO"
  value: number
  max: number
  onValueChange: (val: number) => void
  onMaxChange: (val: number) => void
}

function SystemRow({
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

interface BoostSliderProps {
  value: number
  onChange: (val: number) => void
  disabled: boolean
}

function BoostSlider({ value, onChange, disabled }: BoostSliderProps) {
  const safeValue = Math.min(Math.max(value, 1), 5)
  const percentage = ((safeValue - 1) / 4) * 100

  return (
    <div
      className={`relative flex h-10 w-full touch-none select-none items-center overflow-visible ${
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <div className="pointer-events-none absolute left-3 right-3 h-2 overflow-hidden rounded-full bg-[var(--surface-tertiary)]">
        <div
          className="h-full bg-gradient-to-r from-[#F7931A] to-[#FFB347] transition-all duration-75"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={0.01}
        value={safeValue}
        onChange={(e) =>
          !disabled && onChange(Number.parseFloat(e.target.value))
        }
        disabled={disabled}
        className="absolute inset-0 h-full w-full cursor-inherit opacity-0"
      />
      <div
        className={`pointer-events-none absolute z-10 h-5 w-5 rounded-full transition-all duration-75 ${
          disabled
            ? "border-2 border-[var(--surface-tertiary)] bg-[var(--surface-secondary)]"
            : "bg-[#F7931A] shadow-[0_0_10px_rgba(247,147,26,0.5)] ring-2 ring-[#F7931A]"
        }`}
        style={{ left: `calc(2px + ${percentage}% - ${percentage * 0.24}px)` }}
      />
    </div>
  )
}

import { AnimatedNumber } from "@/components/AnimatedNumber"

export function BoostCalculator() {
  const [lockState, setLockState] = useState<LockState>("MEZO")
  const [userMezo, setUserMezo] = useState<string>(() =>
    formatNumber(calcInitialMezo(), 0),
  )
  const [userBtc, setUserBtc] = useState<string>(INITIAL_BTC)
  const [totalVeMezo, setTotalVeMezo] = useState<number>(INITIAL_TOTAL_VEMEZO)
  const [totalVeBtc, setTotalVeBtc] = useState<number>(INITIAL_TOTAL_VEBTC)
  const [maxVeMezo, setMaxVeMezo] = useState<number>(INITIAL_MAX_VEMEZO)
  const [maxVeBtc, setMaxVeBtc] = useState<number>(INITIAL_MAX_VEBTC)
  const [boost, setBoost] = useState<number>(INITIAL_BOOST)
  const [systemTotalsOpen, setSystemTotalsOpen] = useState<boolean>(false)

  const systemTotalsRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)

  useEffect(() => {
    if (systemTotalsRef.current) {
      setContentHeight(systemTotalsRef.current.scrollHeight)
    }
  }, [])

  const calculateBoost = useCallback(
    (btc: number, mezo: number, tBtc: number, tMezo: number) => {
      if (btc <= 0 || mezo <= 0 || tBtc <= 0 || tMezo <= 0) return 1
      const term1 = tBtc / btc
      const term2 = mezo / tMezo
      const boostCalc = 4 * term1 * term2
      return clampBoost(1 + boostCalc)
    },
    [],
  )

  const solveForMezo = useCallback(
    (targetBoost: number, btc: number, tBtc: number, tMezo: number) => {
      if (btc <= 0 || tBtc <= 0 || tMezo <= 0) return 0
      const boostCalc = targetBoost - 1
      if (boostCalc <= 0) return 0
      return (boostCalc * tMezo * btc) / (4 * tBtc)
    },
    [],
  )

  const solveForBtc = useCallback(
    (targetBoost: number, mezo: number, tBtc: number, tMezo: number) => {
      if (mezo <= 0 || tBtc <= 0 || tMezo <= 0) return 0
      const boostCalc = targetBoost - 1
      if (boostCalc <= 0) return 0
      return (4 * tBtc * mezo) / (tMezo * boostCalc)
    },
    [],
  )

  const handleMezoChange = useCallback(
    (val: string) => {
      setUserMezo(val)
      if (lockState === "MEZO") return

      const mezoNum = parseNumber(val)
      const btcNum = parseNumber(userBtc)

      if (lockState === "NONE") {
        setBoost(calculateBoost(btcNum, mezoNum, totalVeBtc, totalVeMezo))
      } else if (lockState === "BTC") {
        const newBtc = solveForBtc(boost, mezoNum, totalVeBtc, totalVeMezo)
        setUserBtc(formatNumber(newBtc))
      }
    },
    [
      lockState,
      userBtc,
      boost,
      totalVeBtc,
      totalVeMezo,
      calculateBoost,
      solveForBtc,
    ],
  )

  const handleBtcChange = useCallback(
    (val: string) => {
      setUserBtc(val)
      if (lockState === "BTC") return

      const btcNum = parseNumber(val)
      const mezoNum = parseNumber(userMezo)

      if (lockState === "NONE") {
        setBoost(calculateBoost(btcNum, mezoNum, totalVeBtc, totalVeMezo))
      } else if (lockState === "MEZO") {
        const newMezo = solveForMezo(boost, btcNum, totalVeBtc, totalVeMezo)
        setUserMezo(formatNumber(newMezo, 0))
      }
    },
    [
      lockState,
      userMezo,
      boost,
      totalVeBtc,
      totalVeMezo,
      calculateBoost,
      solveForMezo,
    ],
  )

  const handleBoostChange = useCallback(
    (newBoost: number) => {
      setBoost(newBoost)

      if (lockState === "BTC") {
        const mezoNum = parseNumber(userMezo)
        const newBtc = solveForBtc(newBoost, mezoNum, totalVeBtc, totalVeMezo)
        setUserBtc(formatNumber(newBtc, 4))
      } else if (lockState === "MEZO") {
        const btcNum = parseNumber(userBtc)
        const newMezo = solveForMezo(newBoost, btcNum, totalVeBtc, totalVeMezo)
        setUserMezo(formatNumber(newMezo, 0))
      }
    },
    [
      lockState,
      userMezo,
      userBtc,
      totalVeBtc,
      totalVeMezo,
      solveForMezo,
      solveForBtc,
    ],
  )

  const handleTotalChange = useCallback(
    (newTotalBtc: number, newTotalMezo: number) => {
      setTotalVeBtc(newTotalBtc)
      setTotalVeMezo(newTotalMezo)

      const btcNum = parseNumber(userBtc)
      const mezoNum = parseNumber(userMezo)

      if (lockState === "NONE") {
        setBoost(calculateBoost(btcNum, mezoNum, newTotalBtc, newTotalMezo))
      } else if (lockState === "BTC") {
        const newBtc = solveForBtc(boost, mezoNum, newTotalBtc, newTotalMezo)
        setUserBtc(formatNumber(newBtc, 4))
      } else if (lockState === "MEZO") {
        const newMezo = solveForMezo(boost, btcNum, newTotalBtc, newTotalMezo)
        setUserMezo(formatNumber(newMezo, 0))
      }
    },
    [
      lockState,
      userBtc,
      userMezo,
      boost,
      calculateBoost,
      solveForMezo,
      solveForBtc,
    ],
  )

  const toggleLock = useCallback(
    (target: LockState) => {
      if (lockState === target) {
        setLockState("NONE")
        const btcNum = parseNumber(userBtc)
        const mezoNum = parseNumber(userMezo)
        setBoost(calculateBoost(btcNum, mezoNum, totalVeBtc, totalVeMezo))
      } else {
        setLockState(target)
      }
    },
    [lockState, userBtc, userMezo, totalVeBtc, totalVeMezo, calculateBoost],
  )

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Input Section */}
      <div className="flex flex-col gap-3">
        <InputRow
          label="veBTC"
          tokenSymbol="BTC"
          value={userBtc}
          isLocked={lockState === "BTC"}
          readOnly={lockState === "BTC"}
          onToggleLock={() => toggleLock("BTC")}
          onChange={handleBtcChange}
        />

        <InputRow
          label="veMEZO"
          tokenSymbol="MEZO"
          value={userMezo}
          isLocked={lockState === "MEZO"}
          readOnly={lockState === "MEZO"}
          onToggleLock={() => toggleLock("MEZO")}
          onChange={handleMezoChange}
        />
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />

      {/* System Totals (Collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setSystemTotalsOpen(!systemTotalsOpen)}
          className="group flex w-full items-center justify-between py-1"
        >
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--content-secondary)] sm:text-xs">
            System Totals
          </span>
          <svg
            className={`h-3.5 w-3.5 text-[var(--content-secondary)] transition-transform duration-300 sm:h-4 sm:w-4 ${
              systemTotalsOpen ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        <div
          className="overflow-hidden transition-all duration-300 ease-out"
          style={{
            maxHeight: systemTotalsOpen ? `${contentHeight}px` : "0px",
            opacity: systemTotalsOpen ? 1 : 0,
            marginTop: systemTotalsOpen ? "12px" : "0px",
          }}
        >
          <div
            ref={systemTotalsRef}
            className="flex flex-col gap-4 px-1 pb-2 sm:gap-6"
          >
            <SystemRow
              label="veBTC"
              tokenSymbol="BTC"
              value={totalVeBtc}
              max={maxVeBtc}
              onValueChange={(val) => handleTotalChange(val, totalVeMezo)}
              onMaxChange={setMaxVeBtc}
            />

            <SystemRow
              label="veMEZO"
              tokenSymbol="MEZO"
              value={totalVeMezo}
              max={maxVeMezo}
              onValueChange={(val) => handleTotalChange(totalVeBtc, val)}
              onMaxChange={setMaxVeMezo}
            />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />

      {/* Boost Section */}
      <div>
        <div className="mb-3 flex items-end justify-between sm:mb-4">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--content-secondary)] sm:text-xs">
            Your Boost
          </span>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-3xl font-bold tabular-nums tracking-tight text-[#F7931A] sm:text-4xl">
              <AnimatedNumber value={boost} initialValue={boost} />
            </span>
            <span className="text-lg font-bold text-[var(--content-secondary)] sm:text-xl">
              ×
            </span>
          </div>
        </div>

        <div
          className={`transition-all duration-200 ${
            lockState === "NONE" ? "opacity-30" : ""
          }`}
        >
          <BoostSlider
            value={boost}
            onChange={handleBoostChange}
            disabled={lockState === "NONE"}
          />
        </div>

        <div
          className={`mt-2 flex justify-between px-0.5 font-mono text-[10px] font-medium sm:mt-3 sm:text-xs ${
            lockState === "NONE" ? "opacity-30" : ""
          }`}
        >
          {[1, 2, 3, 4, 5].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => lockState !== "NONE" && handleBoostChange(val)}
              disabled={lockState === "NONE"}
              className={`transition-colors ${
                lockState !== "NONE"
                  ? "cursor-pointer hover:text-[#F7931A]"
                  : "cursor-not-allowed"
              } ${
                Math.round(boost) === val
                  ? "text-[#F7931A]"
                  : "text-[var(--content-secondary)]"
              }`}
            >
              {val}×
            </button>
          ))}
        </div>

        <div
          className={`overflow-hidden transition-all duration-300 ease-out ${
            lockState === "NONE"
              ? "mt-3 max-h-12 opacity-100 sm:mt-4"
              : "mt-0 max-h-0 opacity-0"
          }`}
        >
          <p className="text-center text-[10px] text-[var(--content-secondary)] sm:text-xs">
            Lock one input to adjust boost target
          </p>
        </div>
      </div>
    </div>
  )
}

export default BoostCalculator
