import { CLASSIC_URL } from "@/lib/banner"
import { chainName, useNetwork } from "@/lib/network"
import { useViewer } from "@/lib/viewer"
import { shortenAddress } from "@repo/ui/wallet-address"
import { X } from "lucide-react"
import { type ReactElement, type ReactNode, useState } from "react"
import { useConnectDialog } from "./ConnectDialog"

const DISMISS_KEY = "matchbox-pro:preview-banner-dismissed"

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * The one strip under the top bar. Priority: wrong network, then watching,
 * then the dismissible preview notice.
 */
export default function ShellBanner(): ReactElement | null {
  const { viewer, stopWatching } = useViewer()
  const { walletChainId, switchWalletToApp, isSwitching } = useNetwork()
  const { open } = useConnectDialog()
  const [previewDismissed, setPreviewDismissed] = useState(readDismissed)

  if (viewer.mode === "connected" && viewer.wrongNetwork) {
    return (
      <Strip
        pill="Network"
        message={`This wallet is on ${chainName(walletChainId)}. Switch to Mezo to vote, claim, or manage locks.`}
        action={
          <StripButton
            onClick={() => void switchWalletToApp()}
            disabled={isSwitching}
          >
            {isSwitching ? "Switching…" : "Switch to Mezo"}
          </StripButton>
        }
      />
    )
  }

  if (viewer.mode === "watching") {
    return (
      <Strip
        pill="Watching"
        message={`${shortenAddress(viewer.address)} is read-only. Connect this wallet to vote, claim, or manage locks.`}
        action={<StripButton onClick={open}>Connect this wallet</StripButton>}
        onDismiss={stopWatching}
        dismissLabel="Stop watching"
      />
    )
  }

  if (previewDismissed) return null

  return (
    <Strip
      pill="Preview"
      message="Welcome to Matchbox Pro Preview, an early build of the next Matchbox."
      action={
        <a
          href={CLASSIC_URL}
          className="flex h-[30px] shrink-0 items-center rounded-md border border-accent-line bg-surface px-3 text-label text-ink-2 transition-colors hover:border-accent"
        >
          <span className="sm:hidden">Classic</span>
          <span className="hidden sm:inline">Return to Matchbox Classic</span>
        </a>
      }
      onDismiss={() => {
        try {
          window.localStorage.setItem(DISMISS_KEY, "1")
        } catch {
          // Dismissal still applies for this page view.
        }
        setPreviewDismissed(true)
      }}
      dismissLabel="Dismiss preview notice"
    />
  )
}

function Strip({
  pill,
  message,
  action,
  onDismiss,
  dismissLabel,
}: {
  pill: string
  message: string
  action: ReactNode
  onDismiss?: () => void
  dismissLabel?: string
}): ReactElement {
  return (
    <aside
      aria-label={`${pill} notice`}
      className="flex items-center gap-3 border-b border-accent-line/60 bg-accent-soft px-4 py-2.5 md:px-6"
    >
      <span className="flex h-[22px] shrink-0 items-center rounded bg-accent-soft-2 px-2 text-caption font-700 text-accent-ink">
        {pill}
      </span>
      <p className="sr-only m-0 min-w-0 flex-1 truncate text-body-sm font-500 text-ink-2 sm:not-sr-only sm:block">
        {message}
      </p>
      <span className="flex-1 sm:hidden" />
      {action}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel ?? "Dismiss"}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-secondary transition-colors hover:bg-accent-soft-2 hover:text-ink sm:size-7"
        >
          <X aria-hidden="true" size={14} strokeWidth={1.75} />
        </button>
      ) : null}
    </aside>
  )
}

function StripButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[30px] shrink-0 items-center rounded-md border border-accent-line bg-surface px-3 text-label font-500 text-ink-2 transition-colors hover:border-accent disabled:opacity-50"
    >
      {children}
    </button>
  )
}
