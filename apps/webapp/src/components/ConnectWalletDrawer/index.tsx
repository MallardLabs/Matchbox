import { useTheme } from "@/contexts/ThemeContext"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { type WalletEntry, WalletGroup } from "./WalletGroup"
import { useWalletList } from "./useWalletList"

type ConnectWalletDrawerProps = {
  isOpen: boolean
  onClose: () => void
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

function BackIcon(): JSX.Element {
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
      <path d="M19 12H5" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function ConnectingView({
  wallet,
  error,
  onBack,
  onRetry,
}: {
  wallet: WalletEntry
  error: string | null
  onBack: () => void
  onRetry: () => void
}): JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      {/* Wallet Icon with spinner ring */}
      <div className="relative mb-6">
        {wallet.icon ? (
          <img
            src={wallet.icon}
            alt={wallet.name}
            className="h-20 w-20 rounded-2xl"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--border)] text-2xl font-bold text-[var(--content-secondary)]">
            {wallet.name.slice(0, 2)}
          </div>
        )}
        {!error && (
          <div className="absolute -inset-2">
            <div className="h-full w-full animate-spin rounded-full border-4 border-transparent border-t-[var(--accent)]" />
          </div>
        )}
      </div>

      {/* Status text */}
      <h3 className="mb-2 text-lg font-semibold text-[var(--content-primary)]">
        {error ? "Connection Failed" : `Connecting to ${wallet.name}`}
      </h3>

      <p className="mb-6 text-center text-sm text-[var(--content-secondary)]">
        {error
          ? error
          : `Open the ${wallet.name} extension to connect your wallet.`}
      </p>

      {/* Action buttons */}
      {error ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-[var(--border)] px-6 py-2.5 text-sm font-medium text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Try Again
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-[var(--border)] px-6 py-2.5 text-sm font-medium text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
        >
          Cancel
        </button>
      )}
    </div>
  )
}

export function ConnectWalletDrawer({
  isOpen,
  onClose,
}: ConnectWalletDrawerProps): JSX.Element | null {
  const { theme, toggleTheme } = useTheme()
  const drawerRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(onClose, 200)
  }, [onClose])

  const {
    groups,
    connect,
    pendingConnectorId,
    connectingWallet,
    cancelConnect,
    error,
  } = useWalletList(handleClose)

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

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (connectingWallet) {
          cancelConnect()
        } else {
          handleClose()
        }
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
    }
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen, handleClose, connectingWallet, cancelConnect])

  useEffect(() => {
    if (isOpen && drawerRef.current) {
      drawerRef.current.focus()
    }
  }, [isOpen])

  if (!isOpen || !mounted) return null

  const isConnecting = !!connectingWallet

  return createPortal(
    <>
      <div
        className={`fixed inset-0 z-[60] cursor-pointer bg-black/50 transition-opacity duration-200 ${isVisible ? "opacity-100" : "opacity-0"}`}
        onClick={isConnecting ? cancelConnect : handleClose}
        onKeyDown={(e) =>
          e.key === "Enter" && (isConnecting ? cancelConnect() : handleClose())
        }
        role="button"
        tabIndex={0}
        aria-label="Close drawer"
      />

      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Connect wallet"
        tabIndex={-1}
        className={`fixed right-0 top-0 z-[70] flex h-full w-full max-w-[400px] flex-col bg-[var(--surface)] shadow-2xl transition-transform duration-200 ease-out ${isVisible ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[var(--border)] p-4">
          {isConnecting ? (
            <button
              type="button"
              onClick={cancelConnect}
              className="flex items-center gap-2 text-[var(--content-secondary)] transition-colors hover:text-[var(--content-primary)]"
              aria-label="Back to wallet list"
            >
              <BackIcon />
              <span className="text-lg font-semibold text-[var(--content-primary)]">
                Back
              </span>
            </button>
          ) : (
            <h2 className="text-lg font-semibold text-[var(--content-primary)]">
              Connect Wallet
            </h2>
          )}
          <nav className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
              aria-label={
                theme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
            >
              {theme === "light" ? <MoonIcon /> : <SunIcon />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
              aria-label="Close connect wallet drawer"
            >
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </nav>
        </header>

        {/* Content - either connecting view or wallet list */}
        {isConnecting && connectingWallet ? (
          <ConnectingView
            wallet={connectingWallet}
            error={error}
            onBack={cancelConnect}
            onRetry={() => connect(connectingWallet.id, connectingWallet)}
          />
        ) : (
          <>
            {/* Wallet groups */}
            <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
              {groups.map((group) => (
                <WalletGroup
                  key={group.label}
                  label={group.label}
                  wallets={group.wallets}
                  pendingConnectorId={pendingConnectorId}
                  onConnect={connect}
                />
              ))}

              {groups.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-[var(--content-secondary)]">
                  No wallets detected. Install a wallet extension to continue.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  )
}
