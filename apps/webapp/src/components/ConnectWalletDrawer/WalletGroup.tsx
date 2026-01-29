import { useState } from "react"
import { WalletRow } from "./WalletRow"

export type WalletEntry = {
  id: string
  name: string
  icon: string | undefined
  isInstalled: boolean
  downloadUrl: string | undefined
}

type WalletGroupProps = {
  label: string
  wallets: WalletEntry[]
  pendingConnectorId: string | null
  onConnect: (connectorId: string, wallet: WalletEntry) => void
}

function ChevronIcon({ expanded }: { expanded: boolean }): JSX.Element {
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
      className={`transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function WalletGroup({
  label,
  wallets,
  pendingConnectorId,
  onConnect,
}: WalletGroupProps): JSX.Element {
  const [expanded, setExpanded] = useState(true)

  return (
    <section>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        aria-expanded={expanded}
      >
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--content-secondary)]">
          {label}
        </span>
        <span className="text-[var(--content-secondary)]">
          <ChevronIcon expanded={expanded} />
        </span>
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 ${expanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="space-y-0.5">
          {wallets.map((wallet) => (
            <WalletRow
              key={wallet.id}
              name={wallet.name}
              icon={wallet.icon}
              isInstalled={wallet.isInstalled}
              isPending={pendingConnectorId === wallet.id}
              downloadUrl={wallet.downloadUrl}
              onConnect={() => onConnect(wallet.id, wallet)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
