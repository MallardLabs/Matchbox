import { useNetwork } from "@/contexts/NetworkContext"
import { useWalletNetworkGate } from "@/hooks/useWalletNetworkGate"

export function WrongNetworkBanner(): JSX.Element | null {
  const { networkName } = useNetwork()
  const {
    isWrongNetwork,
    walletNetworkName,
    isSwitching,
    switchWalletNetwork,
  } = useWalletNetworkGate()

  if (!isWrongNetwork) return null

  return (
    <section
      aria-label="Wrong network"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--warning)] bg-[var(--warning-subtle)] px-4 py-3"
    >
      <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--content-primary)]">
        <span className="rounded-full border border-[var(--warning)] px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-[var(--warning)]">
          Wrong network
        </span>
        <output>Wallet on {walletNetworkName}</output>
      </p>
      <button
        type="button"
        onClick={switchWalletNetwork}
        disabled={isSwitching}
        className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSwitching ? "Switching..." : `Switch wallet to ${networkName}`}
      </button>
    </section>
  )
}
