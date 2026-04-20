import SystemRow, { formatNumber, parseNumber } from "@/components/SystemRow"
import { TokenIcon } from "@/components/TokenIcon"
import { useCallback, useEffect, useRef, useState } from "react"

type LockState = "NONE" | "MEZO" | "BTC"

const INITIAL_TOTAL_VE_MEZO = 100_000_000
const INITIAL_TOTAL_VE_BTC = 400
const INITIAL_BTC = "21"
const INITIAL_BOOST = 5.0
const INITIAL_MAX_VE_MEZO = 500_000_000
const INITIAL_MAX_VE_BTC = 1000

const calcInitialMezo = () => {
  const btc = Number.parseFloat(INITIAL_BTC)
  const boostCalc = INITIAL_BOOST - 1
  return (boostCalc * INITIAL_TOTAL_VE_MEZO * btc) / (4 * INITIAL_TOTAL_VE_BTC)
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
        className={`h-full w-full bg-transparent pl-10 pr-[76px] text-right font-mono text-base font-semibold outline-none transition-colors placeholder:text-[var(--content-secondary)]/50 sm:pl-16 sm:pr-28 sm:text-2xl ${
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
import { useVeSupply } from "@/hooks/useVeSupply"
import { boostMultiplierFloatFromCalculatorInputs } from "@/utils/boostMultiplierFromCalculatorInputs"

export function BoostCalculator() {
  const {
    totalVeBtc: liveVeBtc,
    totalVeMezo: liveVeMezo,
    fetchStatus,
  } = useVeSupply()

  const [lockState, setLockState] = useState<LockState>("MEZO")
  const [userMezo, setUserMezo] = useState<string>(() =>
    formatNumber(calcInitialMezo(), 0),
  )
  const [userBtc, setUserBtc] = useState<string>(INITIAL_BTC)
  const [totalVeMezo, setTotalVeMezo] = useState<number>(INITIAL_TOTAL_VE_MEZO)
  const [totalVeBtc, setTotalVeBtc] = useState<number>(INITIAL_TOTAL_VE_BTC)
  const [maxVeMezo, setMaxVeMezo] = useState<number>(INITIAL_MAX_VE_MEZO)
  const [maxVeBtc, setMaxVeBtc] = useState<number>(INITIAL_MAX_VE_BTC)
  const [boost, setBoost] = useState<number>(INITIAL_BOOST)
  const [systemTotalsOpen, setSystemTotalsOpen] = useState<boolean>(false)

  const [tickState, setTickState] = useState<
    "loading" | "visible" | "fading" | "hidden" | "x-visible"
  >("loading")

  const systemTotalsRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  const tickShownRef = useRef(false)

  useEffect(() => {
    if (systemTotalsRef.current) {
      setContentHeight(systemTotalsRef.current.scrollHeight)
    }
  }, [])

  useEffect(() => {
    if (liveVeBtc !== undefined) setTotalVeBtc(liveVeBtc)
    if (liveVeMezo !== undefined) setTotalVeMezo(liveVeMezo)
  }, [liveVeBtc, liveVeMezo])

  useEffect(() => {
    if (fetchStatus === "loading") {
      if (!tickShownRef.current) {
        setTickState("loading")
      }
      return
    }

    if (fetchStatus === "error") {
      if (!tickShownRef.current) {
        setTickState("x-visible")
        const hideTimer = setTimeout(() => setTickState("hidden"), 1000)
        return () => clearTimeout(hideTimer)
      }
      return
    }

    // success
    if (tickShownRef.current) return
    tickShownRef.current = true
    setTickState("visible")
    const fadeTimer = setTimeout(() => setTickState("fading"), 2000)
    const hideTimer = setTimeout(() => setTickState("hidden"), 2300)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [fetchStatus])

  const calculateBoost = useCallback(
    (btc: number, mezo: number, tBtc: number, tMezo: number) =>
      boostMultiplierFloatFromCalculatorInputs(btc, mezo, tBtc, tMezo),
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
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--content-secondary)] sm:text-xs">
            System Totals
            {tickState === "loading" && (
              <svg
                className="h-3 w-3 animate-spin text-[var(--content-secondary)]"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            )}
            {(tickState === "visible" || tickState === "fading") && (
              <svg
                className="h-3 w-3 text-[#F7931A] transition-opacity duration-300"
                style={{ opacity: tickState === "fading" ? 0 : 1 }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            {tickState === "x-visible" && (
              <svg
                className="h-3 w-3 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-label="these totals could not be fetched"
              >
                <title>these totals could not be fetched</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18 6L6 18"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 6l12 12"
                />
              </svg>
            )}
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
            <p className="text-[10px] leading-snug text-[var(--content-secondary)] sm:text-xs">
              Live defaults use total locked veBTC and veMEZO from escrow
              <code className="mx-0.5">supply()</code>
              —the same bases as Optimal veMEZO on gauge cards.
            </p>
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
