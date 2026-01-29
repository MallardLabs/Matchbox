import { TokenIcon } from "@/components/TokenIcon"
import { useNetwork } from "@/contexts/NetworkContext"
import { type Token, useTokenList } from "@/hooks/useTokenList"
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalHeader,
} from "@mezo-org/mezo-clay"
import { useWalletAccount } from "@mezo-org/passport"
import { ERC20_ABI } from "@repo/shared/contracts"
import { useCallback, useEffect, useMemo, useState } from "react"
import { type Address, formatUnits, isAddress, parseUnits } from "viem"
import {
  useBalance,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi"

type SendStep = "form" | "confirming" | "success" | "error"

type SendModalProps = {
  isOpen: boolean
  onClose: () => void
}

function ArrowLeftIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function ChevronDownIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function CheckCircleIcon(): JSX.Element {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-[var(--positive)]"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function ErrorCircleIcon(): JSX.Element {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-[var(--negative)]"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

// BTC is the native token on Mezo, address 0x7b7c...0000
const NATIVE_BTC_ADDRESS = "0x7b7C000000000000000000000000000000000000"

function TokenDropdown({
  selectedToken,
  tokens,
  onSelect,
  isOpen,
  onToggle,
}: {
  selectedToken: Token | undefined
  tokens: Token[]
  onSelect: (token: Token) => void
  isOpen: boolean
  onToggle: () => void
}): JSX.Element {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 transition-colors hover:bg-[var(--border)]"
      >
        {selectedToken ? (
          <>
            <TokenIcon symbol={selectedToken.symbol} size={24} />
            <span className="font-medium text-[var(--content-primary)]">
              {selectedToken.symbol}
            </span>
          </>
        ) : (
          <span className="text-[var(--content-secondary)]">Select token</span>
        )}
        <ChevronDownIcon />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-60 w-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
          {tokens.map((token) => (
            <button
              key={token.address}
              type="button"
              onClick={() => {
                onSelect(token)
                onToggle()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-secondary)]"
            >
              <TokenIcon symbol={token.symbol} size={24} />
              <div>
                <div className="font-medium text-[var(--content-primary)]">
                  {token.symbol}
                </div>
                <div className="text-xs text-[var(--content-secondary)]">
                  {token.name}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SendModal({ isOpen, onClose }: SendModalProps): JSX.Element {
  const { accountAddress } = useWalletAccount()
  const { chainId, isMainnet } = useNetwork()
  const { tokens } = useTokenList()

  const [selectedToken, setSelectedToken] = useState<Token | undefined>()
  const [amount, setAmount] = useState("")
  const [recipientAddress, setRecipientAddress] = useState("")
  const [step, setStep] = useState<SendStep>("form")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [isTokenDropdownOpen, setIsTokenDropdownOpen] = useState(false)

  const explorerBaseUrl = isMainnet
    ? "https://explorer.mezo.org"
    : "https://explorer.testnet.mezo.org"

  // Check if selected token is native BTC
  const isNativeToken = useMemo(
    () =>
      selectedToken?.address.toLowerCase() === NATIVE_BTC_ADDRESS.toLowerCase(),
    [selectedToken],
  )

  // Get balance for native token (BTC)
  const { data: nativeBalance } = useBalance({
    address: accountAddress,
    chainId,
    query: {
      enabled: !!accountAddress && isOpen && isNativeToken,
    },
  })

  // Get balance for ERC-20 token
  const { data: tokenBalance } = useReadContract({
    address: selectedToken?.address as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: accountAddress ? [accountAddress] : undefined,
    chainId,
    query: {
      enabled: !!accountAddress && !!selectedToken && isOpen && !isNativeToken,
    },
  })

  // Calculate the balance to display
  const balance = useMemo(() => {
    if (!selectedToken) return undefined
    if (isNativeToken && nativeBalance) {
      return formatUnits(nativeBalance.value, selectedToken.decimals)
    }
    if (!isNativeToken && tokenBalance !== undefined) {
      return formatUnits(tokenBalance as bigint, selectedToken.decimals)
    }
    return undefined
  }, [selectedToken, isNativeToken, nativeBalance, tokenBalance])

  // ERC-20 transfer
  const {
    writeContract,
    data: writeData,
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract()

  // Native token transfer
  const {
    sendTransaction,
    data: sendData,
    isPending: isSendPending,
    error: sendError,
    reset: resetSend,
  } = useSendTransaction()

  // Wait for transaction receipt
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
    })

  // Update txHash when we get data from either method
  useEffect(() => {
    if (writeData) {
      setTxHash(writeData)
    } else if (sendData) {
      setTxHash(sendData)
    }
  }, [writeData, sendData])

  // Handle transaction confirmation
  useEffect(() => {
    if (isConfirmed && txHash) {
      setStep("success")
    }
  }, [isConfirmed, txHash])

  // Handle errors
  useEffect(() => {
    const error = writeError || sendError
    if (error) {
      setErrorMessage(error.message || "Transaction failed")
      setStep("error")
    }
  }, [writeError, sendError])

  const isValidRecipient = useMemo(
    () => isAddress(recipientAddress),
    [recipientAddress],
  )

  const parsedAmount = useMemo(() => {
    if (!amount || !selectedToken) return undefined
    try {
      return parseUnits(amount, selectedToken.decimals)
    } catch {
      return undefined
    }
  }, [amount, selectedToken])

  const hasInsufficientBalance = useMemo(() => {
    if (!balance || !parsedAmount || !selectedToken) return false
    const balanceInUnits = parseUnits(balance, selectedToken.decimals)
    return parsedAmount > balanceInUnits
  }, [balance, parsedAmount, selectedToken])

  const canSend = useMemo(
    () =>
      selectedToken &&
      isValidRecipient &&
      parsedAmount &&
      parsedAmount > 0n &&
      !hasInsufficientBalance,
    [selectedToken, isValidRecipient, parsedAmount, hasInsufficientBalance],
  )

  const handleSend = useCallback(() => {
    if (!canSend || !selectedToken || !parsedAmount) return

    setStep("confirming")
    setErrorMessage(null)

    const to = recipientAddress as Address

    if (isNativeToken) {
      // Send native BTC
      sendTransaction({
        to,
        value: parsedAmount,
        chainId,
      })
    } else {
      // Send ERC-20 token
      writeContract({
        address: selectedToken.address,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to, parsedAmount],
        chainId,
      })
    }
  }, [
    canSend,
    selectedToken,
    parsedAmount,
    recipientAddress,
    isNativeToken,
    sendTransaction,
    writeContract,
    chainId,
  ])

  const handleClose = useCallback(() => {
    // Reset state
    setSelectedToken(undefined)
    setAmount("")
    setRecipientAddress("")
    setStep("form")
    setErrorMessage(null)
    setTxHash(undefined)
    setIsTokenDropdownOpen(false)
    resetWrite()
    resetSend()
    onClose()
  }, [onClose, resetWrite, resetSend])

  const handleSetMax = useCallback(() => {
    if (balance) {
      setAmount(balance)
    }
  }, [balance])

  const renderContent = () => {
    if (step === "success") {
      return (
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircleIcon />
          <h3 className="mt-4 text-lg font-semibold text-[var(--content-primary)]">
            Transaction Sent
          </h3>
          <p className="mt-2 text-sm text-[var(--content-secondary)]">
            Your {selectedToken?.symbol} has been sent successfully.
          </p>
          {txHash && (
            <a
              href={`${explorerBaseUrl}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 text-sm text-[var(--accent)] hover:underline"
            >
              View on Explorer
            </a>
          )}
          <Button
            onClick={handleClose}
            kind="primary"
            overrides={{
              Root: { style: { width: "100%", marginTop: "24px" } },
            }}
          >
            Done
          </Button>
        </div>
      )
    }

    if (step === "error") {
      return (
        <div className="flex flex-col items-center py-6 text-center">
          <ErrorCircleIcon />
          <h3 className="mt-4 text-lg font-semibold text-[var(--content-primary)]">
            Transaction Failed
          </h3>
          <p className="mt-2 max-w-full break-words text-sm text-[var(--content-secondary)]">
            {errorMessage || "Something went wrong. Please try again."}
          </p>
          <Button
            onClick={() => {
              setStep("form")
              setErrorMessage(null)
              resetWrite()
              resetSend()
            }}
            kind="primary"
            overrides={{
              Root: { style: { width: "100%", marginTop: "24px" } },
            }}
          >
            Try Again
          </Button>
        </div>
      )
    }

    if (step === "confirming") {
      return (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--accent)]" />
          <h3 className="mt-4 text-lg font-semibold text-[var(--content-primary)]">
            {isConfirming ? "Confirming Transaction..." : "Confirm in Wallet"}
          </h3>
          <p className="mt-2 text-sm text-[var(--content-secondary)]">
            {isConfirming
              ? "Waiting for the transaction to be confirmed on Mezo."
              : "Please confirm the transaction in your wallet."}
          </p>
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-5">
        {/* Token and Amount */}
        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--content-secondary)]">
            Asset
          </span>
          <div className="flex gap-3">
            <TokenDropdown
              selectedToken={selectedToken}
              tokens={tokens}
              onSelect={setSelectedToken}
              isOpen={isTokenDropdownOpen}
              onToggle={() => setIsTokenDropdownOpen(!isTokenDropdownOpen)}
            />
            <div className="relative flex-1">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                type="text"
                inputMode="decimal"
              />
              {selectedToken && balance && (
                <button
                  type="button"
                  onClick={handleSetMax}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  MAX
                </button>
              )}
            </div>
          </div>
          {selectedToken && balance && (
            <p className="mt-2 text-xs text-[var(--content-secondary)]">
              Balance:{" "}
              {Number(balance).toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })}{" "}
              {selectedToken.symbol}
            </p>
          )}
          {hasInsufficientBalance && (
            <p className="mt-1 text-xs text-[var(--negative)]">
              Insufficient balance
            </p>
          )}
        </div>

        {/* Recipient Address */}
        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--content-secondary)]">
            Send to
          </span>
          <Input
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="Enter Mezo address (0x...)"
          />
          {recipientAddress && !isValidRecipient && (
            <p className="mt-1 text-xs text-[var(--negative)]">
              Invalid address
            </p>
          )}
        </div>

        {/* Network info */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--content-secondary)]">Network</span>
            <span className="flex items-center gap-2 text-[var(--content-primary)]">
              <img
                src="/token icons/Mezo.svg"
                alt="Mezo"
                className="h-4 w-4 rounded-full"
              />
              Mezo {isMainnet ? "Mainnet" : "Testnet"}
            </span>
          </div>
        </div>

        {/* Send Button */}
        <Button
          onClick={handleSend}
          kind="primary"
          disabled={!canSend || isWritePending || isSendPending}
          isLoading={isWritePending || isSendPending}
          overrides={{ Root: { style: { width: "100%" } } }}
        >
          {!selectedToken
            ? "Select a token"
            : !amount || !parsedAmount
              ? "Enter amount"
              : !recipientAddress
                ? "Enter recipient"
                : !isValidRecipient
                  ? "Invalid address"
                  : hasInsufficientBalance
                    ? "Insufficient balance"
                    : "Send"}
        </Button>
      </div>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      overrides={{
        Dialog: {
          style: {
            maxWidth: "420px",
            width: "100%",
          },
        },
      }}
    >
      <ModalHeader>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
            aria-label="Close"
          >
            <ArrowLeftIcon />
          </button>
          <span>Send</span>
        </div>
      </ModalHeader>
      <ModalBody>{renderContent()}</ModalBody>
    </Modal>
  )
}
