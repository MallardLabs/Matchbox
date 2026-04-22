import IncentiveWarningModal from "@/components/IncentiveWarningModal"
import { TokenIcon } from "@/components/TokenIcon"
import { TokenSelector } from "@/components/TokenSelector"
import type { Token } from "@/hooks/useTokenList"
import {
  useAddIncentives,
  useApproveToken,
  useBoostVoterAddress,
  useIsAllowlistedToken,
  useTokenAllowance,
} from "@/hooks/useVoting"
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalHeader,
} from "@mezo-org/mezo-clay"
import { useRouter } from "next/router"
import { useEffect, useMemo, useState } from "react"
import { type Address, formatUnits, parseUnits } from "viem"
import { useAccount, useReadContract } from "wagmi"

type AddGaugeIncentiveModalProps = {
  isOpen: boolean
  onClose: () => void
  gaugeAddress: Address
  gaugeName: string
  gaugeTokenId: bigint | undefined
  gaugeImageUrl: string | null | undefined
  gaugeIconSymbol?: string
  totalIncentivesUsd: number
  gaugeHasNoVotes: boolean
  onIncentivesAdded?: () => void
}

export function AddGaugeIncentiveModal({
  isOpen,
  onClose,
  gaugeAddress,
  gaugeName,
  gaugeTokenId,
  gaugeImageUrl,
  gaugeIconSymbol,
  totalIncentivesUsd,
  gaugeHasNoVotes,
  onIncentivesAdded,
}: AddGaugeIncentiveModalProps) {
  const router = useRouter()
  const { address: walletAddress } = useAccount()
  const boostVoterAddress = useBoostVoterAddress()

  const [incentiveToken, setIncentiveToken] = useState<Token | undefined>()
  const [incentiveAmount, setIncentiveAmount] = useState("")
  const [showIncentiveWarning, setShowIncentiveWarning] = useState(false)

  const parsedAmount = useMemo(() => {
    if (!incentiveToken || !incentiveAmount) return 0n

    try {
      return parseUnits(incentiveAmount, incentiveToken.decimals)
    } catch {
      return 0n
    }
  }, [incentiveAmount, incentiveToken])

  const { isAllowlisted: isTokenAllowlisted } = useIsAllowlistedToken(
    incentiveToken?.address,
  )

  const { allowance, refetch: refetchAllowance } = useTokenAllowance(
    incentiveToken?.address,
    boostVoterAddress,
  )

  const needsApproval =
    allowance !== undefined && !!boostVoterAddress && parsedAmount > allowance

  const { data: tokenBalanceData, refetch: refetchTokenBalance } =
    useReadContract({
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

  const tokenBalance = tokenBalanceData as bigint | undefined
  const formattedTokenBalance =
    incentiveToken && tokenBalance !== undefined
      ? formatUnits(tokenBalance, incentiveToken.decimals)
      : undefined
  const hasInsufficientBalance =
    tokenBalance !== undefined && parsedAmount > tokenBalance

  const {
    approve,
    isPending: isApproving,
    isConfirming: isConfirmingApproval,
    isSuccess: isApprovalSuccess,
    error: approvalError,
    reset: resetApproval,
  } = useApproveToken()

  const {
    addIncentives,
    isPending: isAddingIncentives,
    isConfirming: isConfirmingIncentives,
    isSuccess: isAddIncentivesSuccess,
    error: addIncentivesError,
  } = useAddIncentives()

  useEffect(() => {
    if (!isOpen) {
      setIncentiveToken(undefined)
      setIncentiveAmount("")
      setShowIncentiveWarning(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (isApprovalSuccess) {
      refetchAllowance().then(() => {
        setTimeout(() => {
          resetApproval()
        }, 100)
      })
    }
  }, [isApprovalSuccess, refetchAllowance, resetApproval])

  useEffect(() => {
    if (isAddIncentivesSuccess) {
      void refetchTokenBalance()
      void refetchAllowance()
      onIncentivesAdded?.()
      onClose()
    }
  }, [
    isAddIncentivesSuccess,
    onClose,
    onIncentivesAdded,
    refetchAllowance,
    refetchTokenBalance,
  ])

  const handleApprove = () => {
    if (!incentiveToken || !boostVoterAddress || parsedAmount <= 0n) return
    approve(incentiveToken.address, boostVoterAddress, parsedAmount)
  }

  const submitAddIncentives = () => {
    if (!incentiveToken || parsedAmount === 0n) return
    addIncentives(gaugeAddress, [incentiveToken.address], [parsedAmount])
  }

  const handleAddIncentives = () => {
    if (gaugeHasNoVotes) {
      setShowIncentiveWarning(true)
      return
    }

    submitAddIncentives()
  }

  const handleConfirmAddIncentives = () => {
    setShowIncentiveWarning(false)
    submitAddIncentives()
  }

  const handleMaxAmount = () => {
    if (formattedTokenBalance) {
      setIncentiveAmount(formattedTokenBalance)
    }
  }

  const isSubmitting = isApproving || isConfirmingApproval
  const isFunding = isAddingIncentives || isConfirmingIncentives

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        overrides={{
          Dialog: { style: { maxWidth: "560px", width: "100%" } },
        }}
      >
        <ModalHeader>Add Incentives</ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-5">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                  {gaugeImageUrl ? (
                    <img
                      src={gaugeImageUrl}
                      alt={gaugeName}
                      className="h-full w-full object-cover"
                    />
                  ) : gaugeIconSymbol ? (
                    <TokenIcon symbol={gaugeIconSymbol} size={28} />
                  ) : (
                    <span className="font-mono text-sm text-[var(--content-secondary)]">
                      #{gaugeTokenId?.toString() ?? "?"}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-[var(--content-primary)]">
                      {gaugeName}
                    </h3>
                    {gaugeTokenId && (
                      <span className="rounded-md border border-[rgba(247,147,26,0.3)] bg-[rgba(247,147,26,0.12)] px-2 py-0.5 font-mono text-2xs text-[#F7931A]">
                        #{gaugeTokenId.toString()}
                      </span>
                    )}
                    <span className="rounded-full bg-[rgba(34,197,94,0.12)] px-2 py-0.5 text-2xs font-medium text-[var(--positive)]">
                      Live Gauge
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--content-secondary)]">
                    Current weekly incentives: ${totalIncentivesUsd.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-sm text-[var(--content-secondary)]">
              Add allowlisted tokens directly to this gauge&apos;s bribe pool to
              attract veMEZO votes this epoch.
            </p>

            <TokenSelector
              label="Incentive Token"
              value={incentiveToken}
              onChange={setIncentiveToken}
              placeholder="Select a token"
            />

            {incentiveToken && isTokenAllowlisted === false && (
              <div className="rounded-xl border border-[var(--negative)] bg-[rgba(239,68,68,0.1)] p-3">
                <p className="text-sm text-[var(--negative)]">
                  This token is not allowlisted for incentives.
                </p>
              </div>
            )}

            {gaugeHasNoVotes && (
              <div className="rounded-xl border border-[var(--warning-subtle)] bg-[var(--warning-subtle)] p-3">
                <p className="text-sm text-[var(--warning)]">
                  This gauge has no votes yet. We&apos;ll warn you again before
                  funding it so you can avoid losing incentives in an unvoted
                  epoch.
                </p>
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label
                  htmlFor="add-gauge-incentive-amount"
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

                {incentiveToken && formattedTokenBalance !== undefined && (
                  <div className="flex items-center gap-1">
                    <span className="text-2xs text-[var(--content-tertiary)]">
                      Balance:{" "}
                      {Number(formattedTokenBalance).toLocaleString(undefined, {
                        maximumFractionDigits: 6,
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={handleMaxAmount}
                      className="rounded px-1.5 py-0.5 text-2xs font-semibold uppercase text-[var(--accent)] hover:bg-[var(--surface-secondary)]"
                    >
                      MAX
                    </button>
                  </div>
                )}
              </div>

              <Input
                id="add-gauge-incentive-amount"
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

            {(approvalError || addIncentivesError) && (
              <div className="rounded-xl border border-[var(--negative)] bg-[rgba(239,68,68,0.1)] p-3">
                <p className="text-sm text-[var(--negative)]">
                  Error:{" "}
                  {(addIncentivesError ?? approvalError)?.message ??
                    "Transaction failed"}
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
                  isLoading={isSubmitting}
                  disabled={
                    !incentiveToken ||
                    parsedAmount === 0n ||
                    !boostVoterAddress ||
                    isTokenAllowlisted === false ||
                    hasInsufficientBalance
                  }
                >
                  {`Approve ${incentiveToken?.symbol ?? ""}`.trim()}
                </Button>
              ) : (
                <Button
                  kind="primary"
                  onClick={handleAddIncentives}
                  isLoading={isFunding}
                  disabled={
                    !incentiveToken ||
                    parsedAmount === 0n ||
                    isTokenAllowlisted === false ||
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

      <IncentiveWarningModal
        isOpen={showIncentiveWarning}
        onClose={() => setShowIncentiveWarning(false)}
        onContinue={handleConfirmAddIncentives}
        onVoteFirst={() => {
          setShowIncentiveWarning(false)
          onClose()
          void router.push("/boost")
        }}
      />
    </>
  )
}
