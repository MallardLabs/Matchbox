import SystemRow from "@/components/SystemRow"
import { usePreviewMode } from "@/contexts/PreviewModeContext"
import { useEffect, useState } from "react"
import { formatUnits, parseUnits } from "viem"

const DEFAULT_MAX_VE_BTC = 1000
const DEFAULT_MAX_VE_MEZO = 500_000_000

function bigintToWhole(v: bigint | undefined): number {
  if (v === undefined) return 0
  return Number(formatUnits(v, 18))
}

function wholeToBigint(v: number): bigint {
  if (!Number.isFinite(v) || v < 0) return 0n
  // parseUnits requires a string; clamp to 18 decimals to avoid overflow.
  return parseUnits(v.toFixed(18), 18)
}

export default function PreviewModePanel() {
  const {
    enabled,
    toggle,
    veBTCOverride,
    veMEZOOverride,
    setVeBTCOverride,
    setVeMEZOOverride,
    resetToLive,
    realVeBTCSupply,
    realVeMEZOSupply,
  } = usePreviewMode()

  const [collapsed, setCollapsed] = useState(false)
  const [maxVeBtc, setMaxVeBtc] = useState(DEFAULT_MAX_VE_BTC)
  const [maxVeMezo, setMaxVeMezo] = useState(DEFAULT_MAX_VE_MEZO)

  const btcWhole = bigintToWhole(veBTCOverride)
  const mezoWhole = bigintToWhole(veMEZOOverride)

  // Grow max automatically if user nudges the override above the current ceiling.
  useEffect(() => {
    if (btcWhole > maxVeBtc) setMaxVeBtc(Math.ceil(btcWhole * 1.1))
  }, [btcWhole, maxVeBtc])
  useEffect(() => {
    if (mezoWhole > maxVeMezo) setMaxVeMezo(Math.ceil(mezoWhole * 1.1))
  }, [mezoWhole, maxVeMezo])

  if (!enabled) return null

  return (
    <>
      <div
        className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-full bg-[#F7931A] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_12px_rgba(247,147,26,0.5)]"
        title="Dashboard stats are simulated. Press Shift+P to exit."
      >
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
        Preview mode
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-white/30"
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {!collapsed && (
        <div className="fixed bottom-16 right-4 z-[60] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border)] bg-[var(--surface-primary)] p-4 shadow-[0_10px_40px_rgba(0,0,0,0.4)] backdrop-blur">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-[var(--content-primary)]">
                  Simulated system totals
                </span>
                <span className="rounded bg-[#F7931A]/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#F7931A]">
                  Sim
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-[var(--content-secondary)]">
                Tweak to see boosts and optimal veMEZO across the dashboard
                update live. Press{" "}
                <kbd className="rounded bg-[var(--surface-tertiary)] px-1 font-mono text-[10px]">
                  Shift+P
                </kbd>{" "}
                to exit.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-1">
            <SystemRow
              label="veBTC"
              tokenSymbol="BTC"
              value={btcWhole}
              max={maxVeBtc}
              onValueChange={(val) => setVeBTCOverride(wholeToBigint(val))}
              onMaxChange={setMaxVeBtc}
            />
            <SystemRow
              label="veMEZO"
              tokenSymbol="MEZO"
              value={mezoWhole}
              max={maxVeMezo}
              onValueChange={(val) => setVeMEZOOverride(wholeToBigint(val))}
              onMaxChange={setMaxVeMezo}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <span
              className="truncate font-mono text-[10px] text-[var(--content-secondary)]"
              title={
                realVeBTCSupply !== undefined && realVeMEZOSupply !== undefined
                  ? `Live: ${bigintToWhole(realVeBTCSupply).toLocaleString(undefined, { maximumFractionDigits: 2 })} veBTC / ${bigintToWhole(realVeMEZOSupply).toLocaleString(undefined, { maximumFractionDigits: 0 })} veMEZO`
                  : ""
              }
            >
              {realVeBTCSupply !== undefined && realVeMEZOSupply !== undefined
                ? `Live: ${bigintToWhole(realVeBTCSupply).toLocaleString(undefined, { maximumFractionDigits: 2 })} veBTC / ${bigintToWhole(realVeMEZOSupply).toLocaleString(undefined, { maximumFractionDigits: 0 })} veMEZO`
                : "Live values loading…"}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetToLive}
                className="rounded bg-[var(--surface-tertiary)] px-2 py-1 text-[10px] font-semibold text-[var(--content-primary)] hover:bg-[var(--surface-secondary)]"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={toggle}
                className="rounded bg-[#F7931A] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#E8820C]"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
