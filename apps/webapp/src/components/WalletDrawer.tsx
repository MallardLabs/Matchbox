import { useNetwork } from "@/contexts/NetworkContext"
import { useTheme } from "@/contexts/ThemeContext"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import { CHAIN_ID, CONTRACTS, ERC20_ABI } from "@repo/shared/contracts"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { formatUnits } from "viem"
import { useAccount, useBalance, useDisconnect, useReadContracts } from "wagmi"

function PowerIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  )
}

function SunIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function NetworkIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

type TokenBalance = {
  symbol: string
  name: string
  balance: string
  valueUsd: number
  logoURI?: string
}

type WalletDrawerProps = {
  isOpen: boolean
  onClose: () => void
}

export function WalletDrawer({
  isOpen,
  onClose,
}: WalletDrawerProps): JSX.Element | null {
  const { address } = useAccount()
  const { disconnect } = useDisconnect()
  const { theme, toggleTheme } = useTheme()
  const { chainId, networkName, switchNetwork, isMainnet } = useNetwork()
  const { price: btcPrice } = useBtcPrice()
  const { price: mezoPriceUsd } = useMezoPrice()
  const drawerRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setIsVisible(true))
    } else {
      setIsVisible(false)
    }
  }, [isOpen])

  const contracts =
    chainId === CHAIN_ID.testnet ? CONTRACTS.testnet : CONTRACTS.mainnet

  const { data: btcBalance, isLoading: btcLoading } = useBalance({
    address,
    chainId,
  })

  const { data: mezoBalanceData, isLoading: mezoLoading } = useReadContracts({
    contracts: [
      {
        address: contracts.mezoToken,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        chainId,
      },
    ],
    query: {
      enabled: !!address && isOpen,
    },
  })

  const mezoBalance = mezoBalanceData?.[0]?.result as bigint | undefined
  const isLoadingBalances = btcLoading || mezoLoading

  const btcAmount = btcBalance ? Number(formatUnits(btcBalance.value, 18)) : 0
  const mezoAmount = mezoBalance ? Number(formatUnits(mezoBalance, 18)) : 0

  const btcValueUsd = btcAmount * (btcPrice ?? 0)
  const mezoValueUsd = mezoAmount * (mezoPriceUsd ?? 0)
  const totalValueUsd = btcValueUsd + mezoValueUsd

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
    }
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen && drawerRef.current) {
      drawerRef.current.focus()
    }
  }, [isOpen])

  const handleDisconnect = () => {
    disconnect()
    onClose()
  }

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(onClose, 200)
  }

  const tokenBalances: TokenBalance[] = [
    {
      symbol: "BTC",
      name: "Bitcoin",
      balance: btcAmount.toFixed(6),
      valueUsd: btcValueUsd,
      logoURI: "/token icons/Bitcoin.svg",
    },
    {
      symbol: "MEZO",
      name: "Mezo",
      balance: mezoAmount.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      }),
      valueUsd: mezoValueUsd,
      logoURI: "/token icons/Mezo.svg",
    },
  ]

  if (!isOpen || !mounted) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] cursor-pointer bg-black/50 transition-opacity duration-200 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
        onKeyDown={(e) => e.key === "Enter" && handleClose()}
        role="button"
        tabIndex={0}
        aria-label="Close drawer"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Wallet details"
        tabIndex={-1}
        className={`fixed right-0 top-0 z-[70] flex h-full w-full max-w-[400px] flex-col bg-[var(--surface)] shadow-2xl transition-transform duration-200 ease-out ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
          <button
            type="button"
            onClick={handleClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
            aria-label="Close wallet drawer"
          >
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
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-[var(--content-primary)]">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
            <button
              type="button"
              onClick={handleDisconnect}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--content-secondary)] transition-colors hover:bg-red-500/10 hover:text-red-500"
              aria-label="Disconnect wallet"
            >
              <PowerIcon />
            </button>
          </div>
        </div>

        {/* Total Balance */}
        <div className="border-b border-[var(--border)] p-4">
          <div className="text-xs text-[var(--content-secondary)]">
            Total Balance
          </div>
          {isLoadingBalances ? (
            <div className="mt-1 h-8 w-32 animate-pulse rounded bg-[var(--border)]" />
          ) : (
            <div className="text-3xl font-semibold text-[var(--content-primary)]">
              $
              {totalValueUsd.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          )}
        </div>

        {/* Token Balances */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--content-secondary)]">
            Tokens
          </h3>
          <div className="space-y-2">
            {tokenBalances.map((token) => (
              <div
                key={token.symbol}
                className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3"
              >
                <div className="flex items-center gap-3">
                  {token.logoURI ? (
                    <img
                      src={token.logoURI}
                      alt=""
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--border)] text-xs font-medium">
                      {token.symbol.slice(0, 2)}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium text-[var(--content-primary)]">
                      {token.symbol}
                    </div>
                    <div className="text-xs text-[var(--content-secondary)]">
                      {token.name}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {isLoadingBalances ? (
                    <div className="h-4 w-16 animate-pulse rounded bg-[var(--border)]" />
                  ) : (
                    <>
                      <div className="font-mono text-sm text-[var(--content-primary)]">
                        {token.balance} {token.symbol}
                      </div>
                      <div className="text-xs text-[var(--content-secondary)]">
                        $
                        {token.valueUsd.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings - anchored to bottom */}
        <div className="shrink-0 border-t border-[var(--border)] p-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--content-secondary)]">
            Settings
          </h3>
          <div className="space-y-2">
            {/* Network Selector */}
            <button
              type="button"
              onClick={switchNetwork}
              className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3 transition-colors hover:bg-[var(--border)]"
            >
              <div className="flex items-center gap-3">
                <NetworkIcon />
                <span className="text-sm text-[var(--content-primary)]">
                  {networkName}
                </span>
              </div>
              <span
                className={`h-2 w-2 rounded-full ${isMainnet ? "bg-[#22C55E]" : "bg-[#F7931A]"}`}
              />
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3 transition-colors hover:bg-[var(--border)]"
            >
              <div className="flex items-center gap-3">
                {theme === "light" ? <MoonIcon /> : <SunIcon />}
                <span className="text-sm text-[var(--content-primary)]">
                  {theme === "light" ? "Dark mode" : "Light mode"}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
