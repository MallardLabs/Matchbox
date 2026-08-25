import { TokenSelector } from "@/components/TokenSelector"
import { getContractConfig } from "@/config/contracts"
import { formatWalletWriteError } from "@/config/mezoRpcWrite"
import { useNetwork } from "@/contexts/NetworkContext"
import type { Token } from "@/hooks/useTokenList"
import {
  useAddValidatorIncentive,
  useValidatorTokenAllowlisted,
} from "@/hooks/useValidatorGauge"
import { useApproveToken, useTokenAllowance } from "@/hooks/useVoting"
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalHeader,
} from "@mezo-org/mezo-clay"
import { useEffect, useMemo, useState } from "react"
import { type Address, erc20Abi, formatUnits, parseUnits } from "viem"
import { useAccount, useBalance, useReadContract } from "wagmi"

type Props = {
  gauge: Address
  weight: bigint
  isOpen: boolean
  onClose: () => void
  onAdded: () => void
}

export default function AddValidatorIncentiveModal({
  gauge,
  weight,
  isOpen,
  onClose,
  onAdded,
}: Props): JSX.Element {
  const { chainId } = useNetwork()
  const { address } = useAccount()
  const voter = getContractConfig(chainId).validatorsVoter.address
  const { data: nativeBalance } = useBalance({
    address,
    chainId,
    query: { enabled: !!address },
  })
  const hasNoGas = nativeBalance !== undefined && nativeBalance.value === 0n
  const [token, setToken] = useState<Token>()
  const [amount, setAmount] = useState("")
  const parsedAmount = useMemo(() => {
    if (!token || !amount) return 0n
    try {
      return parseUnits(amount, token.decimals)
    } catch {
      return 0n
    }
  }, [amount, token])
  const { isAllowlisted, isLoading: isCheckingAllowlist } =
    useValidatorTokenAllowlisted(token?.address)
  const { allowance, refetch: refetchAllowance } = useTokenAllowance(
    token?.address,
    voter,
  )
  const { data: balanceData, refetch: refetchBalance } = useReadContract({
    address: token?.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!token && !!address },
  })
  const balance = balanceData as bigint | undefined
  const needsApproval = allowance !== undefined && parsedAmount > allowance
  const hasInsufficientBalance = balance !== undefined && parsedAmount > balance
  const approval = useApproveToken()
  const incentive = useAddValidatorIncentive()

  useEffect(() => {
    if (approval.isSuccess) {
      void refetchAllowance().finally(approval.reset)
    }
  }, [approval.isSuccess, approval.reset, refetchAllowance])

  useEffect(() => {
    if (!incentive.isSuccess) return
    void refetchBalance()
    onAdded()
    onClose()
    incentive.reset()
  }, [incentive.isSuccess, incentive.reset, onAdded, onClose, refetchBalance])

  function close() {
    if (approval.isPending || incentive.isPending) return
    setToken(undefined)
    setAmount("")
    onClose()
  }

  const writeError = approval.error ?? incentive.error
  const isBusy =
    approval.isPending ||
    approval.isConfirming ||
    incentive.isPending ||
    incentive.isConfirming

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      size="default"
      overrides={{ Dialog: { style: { maxWidth: "520px" } } }}
    >
      <ModalHeader>Add validator incentives</ModalHeader>
      <ModalBody>
        <div className="flex flex-col gap-4">
          <p className="text-pretty text-sm text-[var(--content-secondary)]">
            Fund this gauge through ValidatorsVoter. Incentives are distributed
            to veBTC voters for the applicable epoch.
          </p>
          {weight === 0n && (
            <p className="rounded-lg border border-[var(--warning)] p-3 text-xs text-[var(--warning)]">
              This gauge currently has no votes. Funding is allowed, but its
              projected voter APY is infinite until voting power arrives.
            </p>
          )}
          <TokenSelector
            value={token}
            onChange={setToken}
            label="Incentive token"
          />
          <div>
            <label
              htmlFor="validator-incentive-amount"
              className="mb-1 block text-xs text-[var(--content-secondary)]"
            >
              Amount
            </label>
            <Input
              id="validator-incentive-amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              type="number"
              min={0}
              placeholder="0"
            />
            {token && balance !== undefined && (
              <p className="mt-1 text-right font-mono text-2xs text-[var(--content-tertiary)]">
                Balance: {formatUnits(balance, token.decimals)} {token.symbol}
              </p>
            )}
          </div>
          {token && !isCheckingAllowlist && isAllowlisted === false && (
            <p className="text-xs text-[var(--negative)]">
              This token is not allowlisted by ValidatorsVoter.
            </p>
          )}
          {hasInsufficientBalance && (
            <p className="text-xs text-[var(--negative)]">
              The amount exceeds your wallet balance.
            </p>
          )}
          {hasNoGas && (
            <p className="text-xs text-[var(--negative)]">
              This wallet has no BTC for gas. Fund the connected address with a
              small amount of BTC on Mezo before approving.
            </p>
          )}
          {writeError && (
            <p className="text-pretty text-xs text-[var(--negative)]">
              {formatWalletWriteError(writeError)}
            </p>
          )}
          <Button
            onClick={() => {
              if (!token || parsedAmount <= 0n) return
              if (needsApproval)
                approval.approve(token.address, voter, parsedAmount)
              else incentive.addIncentive(gauge, token.address, parsedAmount)
            }}
            disabled={
              isBusy ||
              parsedAmount <= 0n ||
              hasInsufficientBalance ||
              hasNoGas ||
              isAllowlisted !== true
            }
          >
            {isBusy
              ? "Confirming..."
              : needsApproval
                ? `Approve ${token?.symbol ?? "token"}`
                : "Add Incentives"}
          </Button>
        </div>
      </ModalBody>
    </Modal>
  )
}
