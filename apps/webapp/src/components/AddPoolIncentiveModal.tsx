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
import { formatUnits, parseUnits } from "viem"
import { useAccount, useReadContract } from "wagmi"

type AddPoolIncentiveModalProps = {
  isOpen: boolean
  onClose: () => void
  pool: Pool
  onIncentivesAdded?: () => void
}

export default function AddPoolIncentiveModal({
  isOpen,
  onClose,
  pool,
  onIncentivesAdded,
}: AddPoolIncentiveModalProps): JSX.Element {
  const { address: walletAddress } = useAccount()
  const gaugeAddress = pool.gauge ?? undefined
  const { bribeAddress } = usePoolBribeAddress(gaugeAddress)

  const [incentiveToken, setIncentiveToken] = useState<Token | undefined>()
  const [incentiveAmount, setIncentiveAmount] = useState("")

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

  const projectedVAprPercent = useMemo(() => {
    if (deltaUsd <= 0) return currentVAprPercent
    if (currentVoterIncentivesUsd > 0 && currentVAprPercent > 0) {
      const scale =
        (currentVoterIncentivesUsd + deltaUsd) / currentVoterIncentivesUsd
      return currentVAprPercent * scale
    }
    // No current baseline — we can't derive the votes denominator, so the
    // projection is unknown. Return null so the UI shows "—".
    return null
  }, [deltaUsd, currentVAprPercent, currentVoterIncentivesUsd])

  const vAprDelta =
    projectedVAprPercent !== null
      ? projectedVAprPercent - currentVAprPercent
      : null

  const formatApr = (value: number): string => {
    if (!Number.isFinite(value) || value === 0) return "0%"
    if (value < 0.01) return "<0.01%"
    if (value < 1) return `${value.toFixed(2)}%`
    if (value < 100) return `${value.toFixed(1)}%`
    return `${Math.round(value)}%`
  }

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
            veBTC votes and reward LPs this epoch.
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
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                  Projected vAPR
                  <Tooltip
                    id={`add-incentive-vapr-${pool.address}`}
                    content="Estimated voter APR after this deposit, derived by scaling the pool's current vAPR by the new total voter-incentive USD. Updates live as you edit the amount."
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
                  {vAprDelta !== null && vAprDelta > 0 && (
                    <span className="text-2xs text-[var(--positive)]">
                      +{vAprDelta.toFixed(vAprDelta < 1 ? 2 : 1)} pp
                    </span>
                  )}
                </div>
              </div>
              {deltaUsd > 0 && (
                <p className="mt-1 text-2xs text-[var(--content-tertiary)]">
                  Adding ~$
                  {deltaUsd.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{" "}
                  to this epoch&apos;s bribe pot.
                </p>
              )}
              {projectedVAprPercent === null && deltaUsd > 0 && (
                <p className="mt-1 text-2xs text-[var(--content-tertiary)]">
                  No baseline vAPR yet — projection available once this pool has
                  votes or existing incentives.
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
