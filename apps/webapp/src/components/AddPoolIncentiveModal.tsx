import { TokenPairIcon } from "@/components/PoolCard"
import { TokenSelector } from "@/components/TokenSelector"
import Tooltip from "@/components/Tooltip"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import {
  useAddPoolIncentive,
  useIsPoolIncentiveTokenAllowlisted,
  usePoolBribeAddress,
} from "@/hooks/usePoolIncentives"
import type { Pool } from "@/hooks/usePools"
import type { Token } from "@/hooks/useTokenList"
import { useVotables } from "@/hooks/useVotables"
import { useApproveToken, useTokenAllowance } from "@/hooks/useVoting"
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalHeader,
} from "@mezo-org/mezo-clay"
import { getTokenUsdPrice } from "@repo/shared"
import { useEffect, useMemo, useState } from "react"
import { type Address, formatUnits, parseUnits } from "viem"
import { useAccount, useReadContract } from "wagmi"

type AddPoolIncentiveModalProps = {
  isOpen: boolean
  onClose: () => void
  pool: Pool
  onIncentivesAdded?: () => void
  /**
   * Pre-fetched bribe address for this pool's gauge. The PoolsPage loads this
   * for every gauged pool on mount (via `usePoolsIncentivesApr`), so passing it
   * in means the modal opens with the bribe address already resolved — no
   * "Looking up bribe contract…" delay. We still fall back to an on-demand
   * lookup if it wasn't pre-fetched (e.g. opening the modal from a route
   * that didn't hydrate the incentives map).
   */
  prefetchedBribeAddress?: Address | undefined
}

export default function AddPoolIncentiveModal({
  isOpen,
  onClose,
  pool,
  onIncentivesAdded,
  prefetchedBribeAddress,
}: AddPoolIncentiveModalProps): JSX.Element {
  const { address: walletAddress } = useAccount()
  const gaugeAddress = pool.gauge ?? undefined
  // Only fire the on-demand lookup if the caller didn't pre-fetch. This makes
  // the modal feel instant when opened from the Pools page (the common case)
  // while still working standalone.
  const { bribeAddress: fetchedBribeAddress } = usePoolBribeAddress(
    prefetchedBribeAddress ? undefined : gaugeAddress,
  )
  const bribeAddress = prefetchedBribeAddress ?? fetchedBribeAddress

  const [incentiveToken, setIncentiveToken] = useState<Token | undefined>()
  const [incentiveAmount, setIncentiveAmount] = useState("")
  // 1.0 = assume epoch votes stay the same. Higher values model the dilution
  // effect of bribes attracting more votes.
  const [voteMultiplier, setVoteMultiplier] = useState(1.0)
  // How the slider is displayed/labeled. The underlying value is always stored
  // as a multiplier, but users think in either absolute veBTC counts or
  // relative growth percentages. (veBTC is the actual voting token on pool
  // gauges — veMEZO is merely a boost token paired with it.)
  const [sliderMode, setSliderMode] = useState<"veBTC" | "percent">("veBTC")
  // User-edited buffer for the manual input; null means "follow the slider".
  // We keep it separate from voteMultiplier so mid-typing values like "5." or
  // "2.4M" don't fight with the slider while they're being typed.
  const [voteInputDraft, setVoteInputDraft] = useState<string | null>(null)

  const parsedAmount = useMemo(() => {
    if (!incentiveToken || !incentiveAmount) return 0n
    try {
      return parseUnits(incentiveAmount, incentiveToken.decimals)
    } catch {
      return 0n
    }
  }, [incentiveAmount, incentiveToken])

  const { isAllowlisted } = useIsPoolIncentiveTokenAllowlisted(
    incentiveToken?.address,
  )

  const { allowance, refetch: refetchAllowance } = useTokenAllowance(
    incentiveToken?.address,
    bribeAddress,
  )

  const needsApproval =
    allowance !== undefined && !!bribeAddress && parsedAmount > allowance

  const { data: balanceData, refetch: refetchBalance } = useReadContract({
    address: incentiveToken?.address,
    abi: [
      {
        inputs: [{ name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ] as const,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: {
      enabled: !!incentiveToken?.address && !!walletAddress,
    },
  })

  const balance = balanceData as bigint | undefined
  const formattedBalance =
    incentiveToken && balance !== undefined
      ? formatUnits(balance, incentiveToken.decimals)
      : undefined
  const hasInsufficientBalance = balance !== undefined && parsedAmount > balance

  const {
    approve,
    isPending: isApproving,
    isConfirming: isConfirmingApproval,
    isSuccess: isApprovalSuccess,
    error: approvalError,
    reset: resetApproval,
  } = useApproveToken()

  const {
    addIncentive,
    isPending: isAdding,
    isConfirming: isConfirmingAdd,
    isSuccess: isAddSuccess,
    error: addError,
  } = useAddPoolIncentive()

  useEffect(() => {
    if (!isOpen) {
      setIncentiveToken(undefined)
      setIncentiveAmount("")
      setVoteMultiplier(1.0)
      setSliderMode("veBTC")
      setVoteInputDraft(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (isApprovalSuccess) {
      void refetchAllowance().then(() => {
        setTimeout(() => resetApproval(), 100)
      })
    }
  }, [isApprovalSuccess, refetchAllowance, resetApproval])

  useEffect(() => {
    if (isAddSuccess) {
      void refetchBalance()
      void refetchAllowance()
      onIncentivesAdded?.()
      onClose()
    }
  }, [
    isAddSuccess,
    onClose,
    onIncentivesAdded,
    refetchAllowance,
    refetchBalance,
  ])

  const handleApprove = () => {
    if (!incentiveToken || !bribeAddress || parsedAmount <= 0n) return
    approve(incentiveToken.address, bribeAddress, parsedAmount)
  }

  const handleAdd = () => {
    if (!incentiveToken || !bribeAddress || parsedAmount <= 0n) return
    addIncentive(bribeAddress, incentiveToken.address, parsedAmount)
  }

  const handleMax = () => {
    if (formattedBalance) setIncentiveAmount(formattedBalance)
  }

  const isSubmittingApproval = isApproving || isConfirmingApproval
  const isFunding = isAdding || isConfirmingAdd

  // Live vAPR preview: proportionally scale the pool's current voting APR by
  // the new total voter-incentive USD (current voterFees + bribes + delta).
  // vAPR = (voterFees + bribes) * 52 * 100 / USD_votes, so the votes
  // denominator cancels when we scale by incentive ratio.
  const { price: btcPrice } = useBtcPrice()
  const { price: mezoPrice } = useMezoPrice()
  const { byPool: votablesByPool } = useVotables()
  const votable = votablesByPool.get(pool.address.toLowerCase())

  const deltaUsd = useMemo(() => {
    if (!incentiveToken || parsedAmount <= 0n) return 0
    const price = getTokenUsdPrice(
      incentiveToken.address,
      incentiveToken.symbol,
      btcPrice,
      mezoPrice,
    )
    if (price === null) return 0
    const amountNum = Number(formatUnits(parsedAmount, incentiveToken.decimals))
    return amountNum * price
  }, [incentiveToken, parsedAmount, btcPrice, mezoPrice])

  const currentVAprPercent = votable?.votingApr ?? 0
  const currentVoterIncentivesUsd =
    (votable?.voterFeesUsd ?? 0) + (votable?.bribesUsd ?? 0)

  // Derive the USD-denominated vote weight on this pool from the existing
  // vAPR formula. The API gives us votingApr as a percentage, computed as:
  //   vAPR_pct = (incentives * 52 / USD_votes) * 100
  // so USD_votes = incentives * 52 * 100 / vAPR_pct. Returns null if we
  // don't have enough signal (no baseline vAPR or no baseline incentives).
  const currentVotesUsd = useMemo(() => {
    if (currentVAprPercent <= 0 || currentVoterIncentivesUsd <= 0) return null
    return (currentVoterIncentivesUsd * 52 * 100) / currentVAprPercent
  }, [currentVAprPercent, currentVoterIncentivesUsd])

  const projectedVAprPercent = useMemo(() => {
    if (deltaUsd <= 0 && voteMultiplier === 1) return currentVAprPercent
    if (currentVotesUsd === null || currentVotesUsd <= 0) return null
    const newIncentives = currentVoterIncentivesUsd + deltaUsd
    const newVotes = currentVotesUsd * voteMultiplier
    if (newVotes <= 0) return null
    return (newIncentives * 52 * 100) / newVotes
  }, [
    deltaUsd,
    voteMultiplier,
    currentVAprPercent,
    currentVotesUsd,
    currentVoterIncentivesUsd,
  ])

  const vAprDelta =
    projectedVAprPercent !== null
      ? projectedVAprPercent - currentVAprPercent
      : null

  // Cost per $1k of veMEZO voting power on the pool after this deposit —
  // i.e. how much bribe weight your USD is buying relative to the vote pool.
  // Lower = your bribe is a small slice of a big vote pool (cheap per vote).
  // Higher = your bribe is a big slice of a small vote pool (you're paying
  // a lot per unit of voting power, but voters will chase it).
  const costPer1kVotesUsd = useMemo(() => {
    if (deltaUsd <= 0) return null
    if (currentVotesUsd === null || currentVotesUsd <= 0) return null
    const newVotes = currentVotesUsd * voteMultiplier
    if (newVotes <= 0) return null
    return (deltaUsd * 1000) / newVotes
  }, [deltaUsd, voteMultiplier, currentVotesUsd])

  const formatApr = (value: number): string => {
    if (!Number.isFinite(value) || value === 0) return "0%"
    if (value < 0.01) return "<0.01%"
    if (value < 1) return `${value.toFixed(2)}%`
    if (value < 100) return `${value.toFixed(1)}%`
    return `${Math.round(value)}%`
  }

  const formatUsdCents = (value: number): string => {
    if (!Number.isFinite(value)) return "—"
    if (value < 0.01) return "<$0.01"
    if (value < 1) return `$${value.toFixed(3)}`
    if (value < 100) return `$${value.toFixed(2)}`
    return `$${Math.round(value).toLocaleString()}`
  }

  const formatCompact = (value: number): string => {
    if (!Number.isFinite(value)) return "—"
    if (value === 0) return "0"
    const abs = Math.abs(value)
    if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`
    if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`
    if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
    if (abs >= 1) return value.toFixed(0)
    return value.toFixed(2)
  }

  const voteGrowthPct = Math.round((voteMultiplier - 1) * 100)

  // veBTC voting on the pool, for the "absolute veBTC" slider mode. Votes are
  // denominated in veBTC — veMEZO is just the boost token paired with veBTC
  // for pool gauge voting. Derived from USD votes and the current BTC price.
  const currentVotesBtc = useMemo(() => {
    if (currentVotesUsd === null || !btcPrice || btcPrice <= 0) return null
    return currentVotesUsd / btcPrice
  }, [currentVotesUsd, btcPrice])

  // Disable the veBTC mode toggle if we can't derive a count (e.g. no BTC
  // price yet). We fall back to percent mode in that case.
  const canUseVeBtcMode = currentVotesBtc !== null
  const effectiveSliderMode: "veBTC" | "percent" =
    sliderMode === "veBTC" && !canUseVeBtcMode ? "percent" : sliderMode

  // Parse user input like "5.2M", "1,234,567", "50%", "5.2b", "2k" into a raw
  // number. Returns null on invalid input (used to suppress voteMultiplier
  // updates while the user is typing something unparseable).
  const parseSuffixedNumber = (raw: string): number | null => {
    const trimmed = raw.trim().replace(/,/g, "").replace(/%/g, "")
    if (!trimmed) return null
    const suffix = trimmed.slice(-1).toLowerCase()
    const multiplier =
      suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1
    const numPart = multiplier === 1 ? trimmed : trimmed.slice(0, -1)
    const value = Number(numPart)
    if (!Number.isFinite(value)) return null
    return value * multiplier
  }

  // Format the "canonical" input value for the current slider mode — used to
  // populate the input when the user hasn't typed anything. veBTC is shown to
  // higher precision than integer counts because 1 veBTC ≈ $60k+.
  const formatVoteInput = (): string => {
    if (effectiveSliderMode === "veBTC" && currentVotesBtc !== null) {
      const btc = currentVotesBtc * voteMultiplier
      if (btc === 0) return "0"
      if (btc < 1) return btc.toFixed(4)
      if (btc < 100) return btc.toFixed(2)
      return Math.round(btc).toLocaleString()
    }
    return String(voteGrowthPct)
  }

  const voteInputValue = voteInputDraft ?? formatVoteInput()

  const handleVoteInputChange = (raw: string) => {
    setVoteInputDraft(raw)
    const parsed = parseSuffixedNumber(raw)
    if (parsed === null) return
    if (effectiveSliderMode === "veBTC" && currentVotesBtc !== null) {
      if (currentVotesBtc <= 0) return
      setVoteMultiplier(Math.max(0, parsed / currentVotesBtc))
    } else {
      // Percent mode — treat bare number as growth percentage.
      setVoteMultiplier(Math.max(0, 1 + parsed / 100))
    }
  }

  const handleVoteInputBlur = () => setVoteInputDraft(null)

  const handleVoteReset = () => {
    setVoteMultiplier(1.0)
    setVoteInputDraft(null)
  }

  const handleSliderChange = (pct: number) => {
    setVoteMultiplier(1 + pct / 100)
    setVoteInputDraft(null)
  }

  const handleModeChange = (mode: "veBTC" | "percent") => {
    setSliderMode(mode)
    setVoteInputDraft(null)
  }

  const isResettable = voteMultiplier !== 1 || voteInputDraft !== null
  // Slider caps at 300% growth; the numeric input can go beyond.
  const sliderPosition = Math.min(300, Math.max(0, voteGrowthPct))

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      overrides={{
        Dialog: { style: { maxWidth: "560px", width: "100%" } },
      }}
    >
      <ModalHeader>Add Pool Incentives</ModalHeader>
      <ModalBody>
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
            <div className="flex items-center gap-4">
              <TokenPairIcon
                symbol0={pool.token0.symbol}
                symbol1={pool.token1.symbol}
                size={40}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-semibold text-[var(--content-primary)]">
                    {pool.token0.symbol} / {pool.token1.symbol}
                  </h3>
                  <span className="rounded-full bg-[rgba(34,197,94,0.12)] px-2 py-0.5 text-2xs font-medium text-[var(--positive)]">
                    Live Gauge
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-[var(--content-secondary)]">
                  {pool.name}
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm text-[var(--content-secondary)]">
            Add allowlisted tokens to this pool&apos;s bribe contract to attract
            veBTC votes (with veMEZO boost) and reward LPs this epoch.
          </p>

          <TokenSelector
            label="Incentive Token"
            value={incentiveToken}
            onChange={setIncentiveToken}
            placeholder="Select a token"
          />

          {incentiveToken && isAllowlisted === false && (
            <div className="rounded-xl border border-[var(--negative)] bg-[rgba(239,68,68,0.1)] p-3">
              <p className="text-sm text-[var(--negative)]">
                This token is not allowlisted for pool incentives.
              </p>
            </div>
          )}

          {!bribeAddress && pool.gauge && (
            <div className="rounded-xl border border-[var(--warning-subtle)] bg-[var(--warning-subtle)] p-3">
              <p className="text-sm text-[var(--warning)]">
                Looking up bribe contract for this pool…
              </p>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label
                htmlFor="add-pool-incentive-amount"
                className="block text-2xs tracking-wider text-[var(--content-tertiary)]"
              >
                <span className="uppercase">Amount</span>
                {incentiveToken && (
                  <span className="normal-case">
                    {" "}
                    ({incentiveToken.symbol})
                  </span>
                )}
              </label>
              {incentiveToken && formattedBalance !== undefined && (
                <div className="flex items-center gap-1">
                  <span className="text-2xs text-[var(--content-tertiary)]">
                    Balance:{" "}
                    {Number(formattedBalance).toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={handleMax}
                    className="rounded px-1.5 py-0.5 text-2xs font-semibold uppercase text-[var(--accent)] hover:bg-[var(--surface-secondary)]"
                  >
                    MAX
                  </button>
                </div>
              )}
            </div>

            <Input
              id="add-pool-incentive-amount"
              value={incentiveAmount}
              onChange={(e) => setIncentiveAmount(e.target.value)}
              placeholder="0.0"
              type="number"
            />
          </div>

          {hasInsufficientBalance && (
            <div className="rounded-xl border border-[var(--negative)] bg-[rgba(239,68,68,0.1)] p-3">
              <p className="text-sm text-[var(--negative)]">
                Insufficient balance for this incentive amount.
              </p>
            </div>
          )}

          {pool.gauge && (
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                  Projected vAPR
                  <Tooltip
                    id={`add-incentive-vapr-${pool.address}`}
                    content="Estimated voter APR after this deposit. Uses the formula (new bribes + voter fees) × 52 / assumed epoch votes. Drag the slider below to model how vote growth dilutes the APR."
                  />
                </div>
                <div className="flex items-baseline gap-2 font-mono tabular-nums">
                  <span className="text-xs text-[var(--content-tertiary)]">
                    {formatApr(currentVAprPercent)}
                  </span>
                  <span
                    className="text-xs text-[var(--content-tertiary)]"
                    aria-hidden="true"
                  >
                    &rarr;
                  </span>
                  <span
                    className={`text-sm font-semibold transition-colors duration-200 ${
                      projectedVAprPercent !== null &&
                      projectedVAprPercent > currentVAprPercent
                        ? "text-[#F7931A]"
                        : "text-[var(--content-primary)]"
                    }`}
                  >
                    {projectedVAprPercent !== null
                      ? formatApr(projectedVAprPercent)
                      : "—"}
                  </span>
                  {vAprDelta !== null && vAprDelta !== 0 && (
                    <span
                      className={`text-2xs ${
                        vAprDelta > 0
                          ? "text-[var(--positive)]"
                          : "text-[var(--negative)]"
                      }`}
                    >
                      {vAprDelta > 0 ? "+" : ""}
                      {vAprDelta.toFixed(Math.abs(vAprDelta) < 1 ? 2 : 1)} pp
                    </span>
                  )}
                </div>
              </div>

              {/* Vote slider + manual input. The underlying state is always a
               * multiplier; the toggle reshapes labels/ticks and the input's
               * parse target. The numeric input can exceed the slider max. */}
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                    Assumed Epoch Votes
                    <Tooltip
                      id={`add-incentive-slider-${pool.address}`}
                      content="How much veBTC voting power flows into this pool this epoch. veBTC is the voting token — veMEZO pairs alongside it as the boost. Switch between an absolute veBTC count and a percentage change from today. Type directly or drag the slider — higher vote totals dilute the per-voter reward."
                    />
                  </div>
                  {isResettable && (
                    <button
                      type="button"
                      onClick={handleVoteReset}
                      className="rounded px-1.5 py-0.5 text-2xs font-semibold uppercase text-[var(--accent)] hover:bg-[var(--surface)]"
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="mb-2 flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={voteInputValue}
                      onChange={(e) => handleVoteInputChange(e.target.value)}
                      onBlur={handleVoteInputBlur}
                      disabled={currentVotesUsd === null}
                      placeholder={effectiveSliderMode === "veBTC" ? "0" : "0%"}
                      aria-label={
                        effectiveSliderMode === "veBTC"
                          ? "Assumed epoch votes in veBTC"
                          : "Assumed vote growth percent"
                      }
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 pr-12 font-mono text-sm tabular-nums text-[var(--content-primary)] outline-none focus:border-[#F7931A] disabled:cursor-not-allowed disabled:opacity-40"
                    />
                    {effectiveSliderMode === "veBTC" && (
                      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-2xs text-[var(--content-tertiary)]">
                        veBTC
                      </span>
                    )}
                    {effectiveSliderMode === "percent" && (
                      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-2xs text-[var(--content-tertiary)]">
                        %
                      </span>
                    )}
                  </div>
                  <fieldset className="inline-flex overflow-hidden rounded-full border border-[var(--border)] p-0 text-[10px]">
                    <legend className="sr-only">Slider units</legend>
                    <button
                      type="button"
                      onClick={() => handleModeChange("veBTC")}
                      disabled={!canUseVeBtcMode}
                      className={`px-2 py-1 transition-colors ${
                        effectiveSliderMode === "veBTC"
                          ? "bg-[#F7931A] text-white"
                          : "text-[var(--content-secondary)] hover:text-[var(--content-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                      }`}
                    >
                      veBTC
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeChange("percent")}
                      className={`px-2 py-1 transition-colors ${
                        effectiveSliderMode === "percent"
                          ? "bg-[#F7931A] text-white"
                          : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
                      }`}
                    >
                      %
                    </button>
                  </fieldset>
                </div>

                {effectiveSliderMode === "veBTC" &&
                  currentVotesBtc !== null && (
                    <p className="mb-1 text-[10px] text-[var(--content-tertiary)]">
                      Currently voting: {formatCompact(currentVotesBtc)} veBTC
                      {voteGrowthPct > 300 && (
                        <span className="ml-1 text-[var(--accent)]">
                          (slider maxed — input overrides)
                        </span>
                      )}
                    </p>
                  )}

                <input
                  type="range"
                  min={0}
                  max={300}
                  step={5}
                  value={sliderPosition}
                  onChange={(e) => handleSliderChange(Number(e.target.value))}
                  disabled={currentVotesUsd === null}
                  className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[var(--border)] accent-[#F7931A] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Assumed epoch votes slider"
                />
                <div className="mt-1 flex justify-between text-[10px] text-[var(--content-tertiary)]">
                  {effectiveSliderMode === "veBTC" &&
                  currentVotesBtc !== null ? (
                    <>
                      <span>0</span>
                      <span>{formatCompact(currentVotesBtc * 2)}</span>
                      <span>{formatCompact(currentVotesBtc * 3)}</span>
                      <span>{formatCompact(currentVotesBtc * 4)}</span>
                    </>
                  ) : (
                    <>
                      <span>0%</span>
                      <span>+100%</span>
                      <span>+200%</span>
                      <span>+300%</span>
                    </>
                  )}
                </div>
              </div>

              {/* $ / 1k veBTC voting power — cost-per-vote KPI. */}
              <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
                <div className="flex items-center gap-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                  Cost per $1k veBTC
                  <Tooltip
                    id={`add-incentive-cost-${pool.address}`}
                    content="Your new bribe divided by the assumed USD value of veBTC voting this pool (× $1,000). Lower is better — you're competing for votes against every other pool posting bribes this epoch."
                  />
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--content-primary)]">
                  {costPer1kVotesUsd !== null
                    ? formatUsdCents(costPer1kVotesUsd)
                    : "—"}
                </span>
              </div>

              {deltaUsd > 0 && (
                <p className="text-2xs text-[var(--content-tertiary)]">
                  Adding ~$
                  {deltaUsd.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{" "}
                  to this epoch&apos;s bribe pot.
                </p>
              )}
              {currentVotesUsd === null && deltaUsd > 0 && (
                <p className="text-2xs text-[var(--content-tertiary)]">
                  No baseline vAPR yet — projection and cost available once this
                  pool has votes or existing incentives.
                </p>
              )}
            </div>
          )}

          {(approvalError || addError) && (
            <div className="rounded-xl border border-[var(--negative)] bg-[rgba(239,68,68,0.1)] p-3">
              <p className="text-sm text-[var(--negative)]">
                Error:{" "}
                {(addError ?? approvalError)?.message ?? "Transaction failed"}
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button kind="tertiary" onClick={onClose}>
              Cancel
            </Button>
            {!walletAddress ? (
              <Button kind="primary" disabled>
                Connect Wallet to Continue
              </Button>
            ) : needsApproval ? (
              <Button
                kind="primary"
                onClick={handleApprove}
                isLoading={isSubmittingApproval}
                disabled={
                  !incentiveToken ||
                  parsedAmount === 0n ||
                  !bribeAddress ||
                  isAllowlisted === false ||
                  hasInsufficientBalance
                }
              >
                {`Approve ${incentiveToken?.symbol ?? ""}`.trim()}
              </Button>
            ) : (
              <Button
                kind="primary"
                onClick={handleAdd}
                isLoading={isFunding}
                disabled={
                  !incentiveToken ||
                  parsedAmount === 0n ||
                  !bribeAddress ||
                  isAllowlisted === false ||
                  hasInsufficientBalance
                }
              >
                Add Incentives
              </Button>
            )}
          </div>
        </div>
      </ModalBody>
    </Modal>
  )
}
