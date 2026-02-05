import { useNetwork } from "@/contexts/NetworkContext"
import { useWalletAccount } from "@mezo-org/passport"
import { useEffect, useState } from "react"
import { useBytecode } from "wagmi"

type WalletSetupViewProps = {
  onReady: () => void
  onCancel: () => void
}

export function WalletSetupView({
  onReady,
  onCancel,
}: WalletSetupViewProps): JSX.Element {
  const { accountAddress, networkFamily } = useWalletAccount()
  const { chainId } = useNetwork()
  const [dots, setDots] = useState("")

  const isBitcoinWallet = networkFamily === "bitcoin"

  // Check if the account has bytecode (is a deployed contract/Safe)
  const { data: bytecode, isLoading: isBytecodeLoading } = useBytecode({
    address: accountAddress,
    chainId,
    query: {
      enabled: !!accountAddress && isBitcoinWallet,
      refetchInterval: 2000, // Poll every 2 seconds to check if Safe is deployed
    },
  })

  const isDeployed = bytecode && bytecode !== "0x"

  // Animate the dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."))
    }, 500)
    return () => clearInterval(interval)
  }, [])

  // Auto-proceed when deployed
  useEffect(() => {
    if (isDeployed) {
      // Small delay for better UX
      const timeout = setTimeout(onReady, 500)
      return () => clearTimeout(timeout)
    }
  }, [isDeployed, onReady])

  // If not a Bitcoin wallet or already deployed, proceed immediately
  useEffect(() => {
    if (!isBitcoinWallet || (!isBytecodeLoading && isDeployed)) {
      onReady()
    }
  }, [isBitcoinWallet, isBytecodeLoading, isDeployed, onReady])

  // Show loading for EVM wallets briefly
  if (!isBitcoinWallet) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--accent)]" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      {/* Animated Logo */}
      <div className="relative mb-8">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--accent)]">
          <img src="/token icons/Mezo.svg" alt="Mezo" className="h-14 w-14" />
        </div>
        <div className="absolute -inset-3 animate-spin rounded-full border-4 border-transparent border-t-[var(--accent)]" />
      </div>

      {/* Status Text */}
      <h3 className="mb-2 text-2xl font-bold text-[var(--content-primary)]">
        Setting Up Your Wallet{dots}
      </h3>

      <p className="mb-8 max-w-[280px] text-[var(--content-secondary)]">
        We're preparing your Smart Account on Mezo. This only happens once and
        may take a moment.
      </p>

      {/* Progress Steps */}
      <div className="mb-8 w-full max-w-[280px] space-y-3">
        <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-secondary)] p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500">
            <svg
              width="16"
              height="16"
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
          <span className="text-sm font-medium text-[var(--content-primary)]">
            Bitcoin wallet connected
          </span>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-secondary)] p-3">
          {isDeployed ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500">
              <svg
                width="16"
                height="16"
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
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </div>
          )}
          <span className="text-sm font-medium text-[var(--content-primary)]">
            {isDeployed ? "Smart Account ready" : "Deploying Smart Account..."}
          </span>
        </div>
      </div>

      {/* Info Box */}
      <div className="mb-6 w-full max-w-[280px] rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
        <p className="text-xs text-[var(--content-secondary)]">
          <span className="font-semibold text-[var(--content-primary)]">
            Why is this needed?
          </span>
          <br />
          Your Bitcoin wallet uses a Smart Account (Safe) on Mezo to sign
          transactions. This is deployed automatically and gas-free.
        </p>
      </div>

      {/* Cancel Button */}
      <button
        type="button"
        onClick={onCancel}
        className="text-sm text-[var(--content-secondary)] transition-colors hover:text-[var(--content-primary)]"
      >
        Cancel
      </button>
    </div>
  )
}

// Hook to check if wallet is ready for transactions
export function useWalletReady() {
  const { accountAddress, networkFamily } = useWalletAccount()
  const { chainId } = useNetwork()

  const isBitcoinWallet = networkFamily === "bitcoin"

  const { data: bytecode, isLoading } = useBytecode({
    address: accountAddress,
    chainId,
    query: {
      enabled: !!accountAddress && isBitcoinWallet,
    },
  })

  const isDeployed = bytecode && bytecode !== "0x"

  // EVM wallets are always ready, Bitcoin wallets need Smart Account deployed
  const isReady = !isBitcoinWallet || isDeployed

  return {
    isReady,
    isLoading: isBitcoinWallet && isLoading,
    needsSetup: isBitcoinWallet && !isDeployed && !isLoading,
  }
}
