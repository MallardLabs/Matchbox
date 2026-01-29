import { TokenIcon } from "@/components/TokenIcon"
import { useNetwork } from "@/contexts/NetworkContext"
import { type Token, useTokenList } from "@/hooks/useTokenList"
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

// BTC is the native token on Mezo
const NATIVE_BTC_ADDRESS = "0x7b7C000000000000000000000000000000000000"

function ChevronDownIcon(): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
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
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition-all hover:border-[var(--content-tertiary)] hover:bg-[var(--surface-secondary)]"
      >
        {selectedToken ? (
          <div className="flex items-center gap-3">
            <TokenIcon symbol={selectedToken.symbol} size={32} />
            <div className="text-left">
              <div className="font-semibold text-[var(--content-primary)]">
                {selectedToken.symbol}
              </div>
              <div className="text-xs text-[var(--content-secondary)]">
                {selectedToken.name}
              </div>
            </div>
          </div>
        ) : (
          <span className="text-[var(--content-secondary)]">Select token</span>
        )}
        <ChevronDownIcon />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
          {tokens.map((token) => (
            <button
              key={token.address}
              type="button"
              onClick={() => {
                onSelect(token)
                onToggle()
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-secondary)]"
            >
              <TokenIcon symbol={token.symbol} size={32} />
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

type SendViewProps = {
  onBack: () => void
  onClose: () => void
}

export function SendView({ onBack, onClose }: SendViewProps): JSX.Element {
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
      enabled: !!accountAddress && isNativeToken,
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
      enabled: !!accountAddress && !!selectedToken && !isNativeToken,
    },
  })

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

  const {
    writeContract,
    data: writeData,
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract()

  const {
    sendTransaction,
    data: sendData,
    isPending: isSendPending,
    error: sendError,
    reset: resetSend,
  } = useSendTransaction()

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
    })

  useEffect(() => {
    if (writeData) setTxHash(writeData)
    else if (sendData) setTxHash(sendData)
  }, [writeData, sendData])

  useEffect(() => {
    if (isConfirmed && txHash) setStep("success")
  }, [isConfirmed, txHash])

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
      sendTransaction({
        to,
        value: parsedAmount,
        data: "0x" as `0x${string}`,
      })
    } else {
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

  const handleReset = useCallback(() => {
    setSelectedToken(undefined)
    setAmount("")
    setRecipientAddress("")
    setStep("form")
    setErrorMessage(null)
    setTxHash(undefined)
    setIsTokenDropdownOpen(false)
    resetWrite()
    resetSend()
  }, [resetWrite, resetSend])

  const handleSetMax = useCallback(() => {
    if (balance) setAmount(balance)
  }, [balance])

  // Success view
  if (step === "success") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-500 shadow-lg shadow-green-500/25">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 className="mb-2 text-2xl font-bold text-[var(--content-primary)]">
          Sent!
        </h3>
        <p className="mb-2 text-[var(--content-secondary)]">
          Your {selectedToken?.symbol} is on its way
        </p>
        {txHash && (
          <a
            href={`${explorerBaseUrl}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-8 text-sm text-[var(--accent)] hover:underline"
          >
            View on Explorer →
          </a>
        )}
        <div className="flex w-full gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 rounded-2xl border border-[var(--border)] py-3 font-medium text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
          >
            Send More
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-[var(--accent)] py-3 font-medium text-white transition-opacity hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // Error view
  if (step === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-red-400 to-rose-500 shadow-lg shadow-red-500/25">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <h3 className="mb-2 text-2xl font-bold text-[var(--content-primary)]">
          Failed
        </h3>
        <p className="mb-8 max-w-[280px] text-sm text-[var(--content-secondary)]">
          {errorMessage || "Something went wrong. Please try again."}
        </p>
        <div className="flex w-full gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-2xl border border-[var(--border)] py-3 font-medium text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("form")
              setErrorMessage(null)
              resetWrite()
              resetSend()
            }}
            className="flex-1 rounded-2xl bg-[var(--accent)] py-3 font-medium text-white transition-opacity hover:opacity-90"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // Confirming view
  if (step === "confirming") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="relative mb-8">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-orange-500 shadow-lg shadow-orange-500/25">
            {selectedToken && (
              <TokenIcon symbol={selectedToken.symbol} size={48} />
            )}
          </div>
          <div className="absolute -inset-3 animate-spin rounded-full border-4 border-transparent border-t-[var(--accent)]" />
        </div>
        <h3 className="mb-2 text-2xl font-bold text-[var(--content-primary)]">
          {isConfirming ? "Confirming..." : "Confirm in Wallet"}
        </h3>
        <p className="text-[var(--content-secondary)]">
          {isConfirming
            ? "Waiting for confirmation on Mezo"
            : "Please confirm the transaction in your wallet"}
        </p>
      </div>
    )
  }

  // Form view
  return (
    <div className="flex flex-1 flex-col px-4">
      {/* Amount Section */}
      <div className="mb-6 rounded-3xl bg-gradient-to-br from-[var(--surface-secondary)] to-[var(--surface)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--content-secondary)]">
            You're sending
          </span>
          {selectedToken && balance && (
            <button
              type="button"
              onClick={handleSetMax}
              className="rounded-full bg-[var(--accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20"
            >
              MAX
            </button>
          )}
        </div>

        <div className="mb-4 flex items-center gap-4">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full bg-transparent text-4xl font-bold text-[var(--content-primary)] outline-none placeholder:text-[var(--content-tertiary)]"
          />
        </div>

        <TokenDropdown
          selectedToken={selectedToken}
          tokens={tokens}
          onSelect={setSelectedToken}
          isOpen={isTokenDropdownOpen}
          onToggle={() => setIsTokenDropdownOpen(!isTokenDropdownOpen)}
        />

        {selectedToken && balance && (
          <p className="mt-3 text-sm text-[var(--content-secondary)]">
            Balance:{" "}
            <span className="font-medium text-[var(--content-primary)]">
              {Number(balance).toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })}{" "}
              {selectedToken.symbol}
            </span>
          </p>
        )}

        {hasInsufficientBalance && (
          <p className="mt-2 text-sm font-medium text-red-500">
            Insufficient balance
          </p>
        )}
      </div>

      {/* Recipient Section */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-[var(--content-secondary)]">
          To
        </label>
        <div className="relative">
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="0x..."
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 font-mono text-sm text-[var(--content-primary)] outline-none transition-colors placeholder:text-[var(--content-tertiary)] focus:border-[var(--accent)]"
          />
          {recipientAddress && !isValidRecipient && (
            <p className="mt-2 text-sm text-red-500">Invalid address</p>
          )}
        </div>
      </div>

      {/* Network Badge */}
      <div className="mb-6 flex items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] py-3">
        <img
          src="/token icons/Mezo.svg"
          alt="Mezo"
          className="h-5 w-5 rounded-full"
        />
        <span className="text-sm font-medium text-[var(--content-primary)]">
          Mezo {isMainnet ? "Mainnet" : "Testnet"}
        </span>
        <span className="h-2 w-2 rounded-full bg-green-500" />
      </div>

      {/* Send Button */}
      <button
        type="button"
        onClick={handleSend}
        disabled={!canSend || isWritePending || isSendPending}
        className="mt-auto w-full rounded-2xl bg-gradient-to-r from-[var(--accent)] to-orange-500 py-4 text-lg font-semibold text-white shadow-lg shadow-orange-500/25 transition-all hover:shadow-xl hover:shadow-orange-500/30 disabled:opacity-50 disabled:shadow-none"
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
      </button>
    </div>
  )
}
