import { useNetwork } from "@/contexts/NetworkContext"
import { useTheme } from "@/contexts/ThemeContext"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import { useWalletAccount } from "@mezo-org/passport"
import { CHAIN_ID, CONTRACTS, ERC20_ABI } from "@repo/shared/contracts"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { formatUnits } from "viem"
import { useBalance, useDisconnect, useReadContracts } from "wagmi"
import { ReceiveView } from "./ReceiveView"
import { SendView } from "./SendView"
import { useWalletReady, WalletSetupView } from "./WalletSetupView"

type DrawerView = "main" | "send" | "receive" | "setup"

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

function CopyIcon(): JSX.Element {
  return (
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
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon(): JSX.Element {
  return (
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function EthereumIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z" />
    </svg>
  )
}

function SendIcon(): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

function ReceiveIcon(): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  )
}

function BackIcon(): JSX.Element {
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
      <path d="M19 12H5" />
      <polyline points="12 19 5 12 12 5" />
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
  const { accountAddress, walletAddress, networkFamily } = useWalletAccount()
  const { disconnect } = useDisconnect()
  const { theme, toggleTheme } = useTheme()
  const { chainId, networkName, switchNetwork, isMainnet } = useNetwork()
  const { price: btcPrice } = useBtcPrice()
  const { price: mezoPriceUsd } = useMezoPrice()
  const { needsSetup } = useWalletReady()
  const drawerRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<DrawerView>("main")
  const [pendingView, setPendingView] = useState<"send" | "receive" | null>(
    null,
  )

  const isBitcoinWallet = networkFamily === "bitcoin"

  const formatAddress = (addr: string | undefined) => {
    if (!addr) return ""
    if (addr.length > 20) {
      return `${addr.slice(0, 6)}...${addr.slice(-4)}`
    }
    return addr
  }

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAddress(text)
      setTimeout(() => setCopiedAddress(null), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setIsVisible(true))
    } else {
      setIsVisible(false)
      // Reset view when drawer closes
      setTimeout(() => setCurrentView("main"), 200)
    }
  }, [isOpen])

  const contracts =
    chainId === CHAIN_ID.testnet ? CONTRACTS.testnet : CONTRACTS.mainnet

  const { data: btcBalance, isLoading: btcLoading } = useBalance({
    address: accountAddress,
    chainId,
  })

  const { data: mezoBalanceData, isLoading: mezoLoading } = useReadContracts({
    contracts: [
      {
        address: contracts.mezoToken,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: accountAddress ? [accountAddress] : undefined,
        chainId,
      },
    ],
    query: {
      enabled: !!accountAddress && isOpen,
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
      if (e.key === "Escape") {
        if (currentView !== "main") {
          setCurrentView("main")
        } else {
          onClose()
        }
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
    }
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen, onClose, currentView])

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

  const handleSendClick = useCallback(() => {
    if (needsSetup) {
      setPendingView("send")
      setCurrentView("setup")
    } else {
      setCurrentView("send")
    }
  }, [needsSetup])

  const handleReceiveClick = useCallback(() => {
    setCurrentView("receive")
  }, [])

  const handleSetupComplete = useCallback(() => {
    if (pendingView) {
      setCurrentView(pendingView)
      setPendingView(null)
    } else {
      setCurrentView("main")
    }
  }, [pendingView])

  const handleSetupCancel = useCallback(() => {
    setPendingView(null)
    setCurrentView("main")
  }, [])

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

  const getViewTitle = () => {
    switch (currentView) {
      case "send":
        return "Send"
      case "receive":
        return "Receive"
      case "setup":
        return "Wallet Setup"
      default:
        return null
    }
  }

  const showBackButton = currentView !== "main"

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] cursor-pointer bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
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
        className={`fixed right-0 top-0 z-[70] flex h-full w-full max-w-[420px] flex-col bg-[var(--surface)] shadow-2xl transition-transform duration-300 ease-out ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
          {showBackButton ? (
            <button
              type="button"
              onClick={() => setCurrentView("main")}
              className="flex items-center gap-2 text-[var(--content-secondary)] transition-colors hover:text-[var(--content-primary)]"
            >
              <BackIcon />
              <span className="text-lg font-semibold text-[var(--content-primary)]">
                {getViewTitle()}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
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
          )}

          <div className="flex items-center gap-2">
            {!showBackButton && (
              <span className="font-mono text-sm text-[var(--content-primary)]">
                {formatAddress(walletAddress)}
              </span>
            )}
            <button
              type="button"
              onClick={handleDisconnect}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--content-secondary)] transition-colors hover:bg-red-500/10 hover:text-red-500"
              aria-label="Disconnect wallet"
            >
              <PowerIcon />
            </button>
          </div>
        </div>

        {/* Content with slide animation */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {/* Main View */}
          <div
            className={`absolute inset-0 flex flex-col overflow-y-auto transition-all duration-300 ease-out ${
              currentView === "main"
                ? "translate-x-0 opacity-100"
                : "-translate-x-full opacity-0"
            }`}
          >
            {/* Total Balance */}
            <div className="border-b border-[var(--border)] p-6">
              <div className="mb-1 text-sm text-[var(--content-secondary)]">
                Total Balance
              </div>
              {isLoadingBalances ? (
                <div className="mt-1 h-10 w-40 animate-pulse rounded-lg bg-[var(--border)]" />
              ) : (
                <div className="text-4xl font-bold text-[var(--content-primary)]">
                  $
                  {totalValueUsd.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              )}

              {/* Send & Receive Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={handleSendClick}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--accent)] to-orange-500 py-3 font-semibold text-white shadow-lg shadow-orange-500/20 transition-all hover:shadow-xl hover:shadow-orange-500/30"
                >
                  <SendIcon />
                  Send
                </button>
                <button
                  type="button"
                  onClick={handleReceiveClick}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] py-3 font-semibold text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
                >
                  <ReceiveIcon />
                  Receive
                </button>
              </div>
            </div>

            {/* Token Balances */}
            <div className="min-h-0 flex-1 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--content-secondary)]">
                Tokens
              </h3>
              <div className="space-y-2">
                {tokenBalances.map((token) => (
                  <div
                    key={token.symbol}
                    className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 transition-colors hover:bg-[var(--border)]/50"
                  >
                    <div className="flex items-center gap-3">
                      {token.logoURI ? (
                        <img
                          src={token.logoURI}
                          alt=""
                          className="h-10 w-10 rounded-full"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--border)] text-xs font-medium">
                          {token.symbol.slice(0, 2)}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-[var(--content-primary)]">
                          {token.symbol}
                        </div>
                        <div className="text-sm text-[var(--content-secondary)]">
                          {token.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {isLoadingBalances ? (
                        <div className="h-5 w-20 animate-pulse rounded bg-[var(--border)]" />
                      ) : (
                        <>
                          <div className="font-mono font-semibold text-[var(--content-primary)]">
                            {token.balance}
                          </div>
                          <div className="text-sm text-[var(--content-secondary)]">
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

            {/* Bottom section - Addresses & Settings */}
            <div className="shrink-0 border-t border-[var(--border)] p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--content-secondary)]">
                Addresses
              </h3>
              <div className="mb-4 space-y-1">
                {isBitcoinWallet && walletAddress && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(walletAddress)}
                    className="flex w-full items-center justify-between rounded-xl bg-[var(--surface-secondary)] px-3 py-2 text-left transition-colors hover:bg-[var(--border)]"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src="/token icons/Bitcoin.svg"
                        alt=""
                        className="h-6 w-6 rounded-full"
                      />
                      <span className="font-mono text-sm text-[var(--content-primary)]">
                        {formatAddress(walletAddress)}
                      </span>
                    </div>
                    <span className="text-[var(--content-secondary)]">
                      {copiedAddress === walletAddress ? (
                        <CheckIcon />
                      ) : (
                        <CopyIcon />
                      )}
                    </span>
                  </button>
                )}
                {accountAddress && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(accountAddress)}
                    className="flex w-full items-center justify-between rounded-xl bg-[var(--surface-secondary)] px-3 py-2 text-left transition-colors hover:bg-[var(--border)]"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#627EEA] text-white">
                        <EthereumIcon size={14} />
                      </div>
                      <span className="font-mono text-sm text-[var(--content-primary)]">
                        {formatAddress(accountAddress)}
                      </span>
                      {isBitcoinWallet && (
                        <span className="text-[10px] text-[var(--content-secondary)]">
                          (Mezo)
                        </span>
                      )}
                    </div>
                    <span className="text-[var(--content-secondary)]">
                      {copiedAddress === accountAddress ? (
                        <CheckIcon />
                      ) : (
                        <CopyIcon />
                      )}
                    </span>
                  </button>
                )}
              </div>

              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--content-secondary)]">
                Settings
              </h3>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={switchNetwork}
                  className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3 transition-colors hover:bg-[var(--border)]"
                >
                  <div className="flex items-center gap-3">
                    <NetworkIcon />
                    <span className="text-sm text-[var(--content-primary)]">
                      {networkName}
                    </span>
                  </div>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${isMainnet ? "bg-green-500" : "bg-orange-500"}`}
                  />
                </button>

                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3 transition-colors hover:bg-[var(--border)]"
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

          {/* Send View */}
          <div
            className={`absolute inset-0 flex flex-col overflow-y-auto bg-[var(--surface)] transition-all duration-300 ease-out ${
              currentView === "send"
                ? "translate-x-0 opacity-100"
                : "translate-x-full opacity-0"
            }`}
          >
            <SendView onBack={() => setCurrentView("main")} onClose={handleClose} />
          </div>

          {/* Receive View */}
          <div
            className={`absolute inset-0 flex flex-col overflow-y-auto bg-[var(--surface)] transition-all duration-300 ease-out ${
              currentView === "receive"
                ? "translate-x-0 opacity-100"
                : "translate-x-full opacity-0"
            }`}
          >
            <ReceiveView onBack={() => setCurrentView("main")} />
          </div>

          {/* Setup View */}
          <div
            className={`absolute inset-0 flex flex-col overflow-y-auto bg-[var(--surface)] transition-all duration-300 ease-out ${
              currentView === "setup"
                ? "translate-x-0 opacity-100"
                : "translate-x-full opacity-0"
            }`}
          >
            <WalletSetupView
              onReady={handleSetupComplete}
              onCancel={handleSetupCancel}
            />
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
