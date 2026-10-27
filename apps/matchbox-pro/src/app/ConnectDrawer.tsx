import { walletConnectEnabled } from "@/lib/wallet/config"
import { preloadQrEncoder } from "@/lib/wallet/walletConnectPairing"
import {
  type WalletEntry,
  type WalletGroups,
  connectError,
  groupWallets,
  walletEnvironment,
} from "@/lib/wallet/wallets"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Dialog from "@repo/ui/dialog"
import * as Toast from "@repo/ui/toast"
import { shortenAddress } from "@repo/ui/wallet-address"
import { ArrowLeft, ArrowUpRight, ChevronRight, X } from "lucide-react"
import { type ReactElement, useEffect, useMemo, useRef, useState } from "react"
import { useAccount, useConnect } from "wagmi"
import WalletConnectPairing from "./WalletConnectPairing"

const TERMS_URL = "https://mezo.org/legal/terms"
const PRIVACY_URL = "https://mezo.org/legal/privacy"

type View =
  | { kind: "list" }
  | { kind: "connecting"; wallet: WalletEntry; uri?: string; error?: string }

/** Icons resolved once: RainbowKit loads most of them from async chunks. */
function useWalletIcons(groups: WalletGroups): Record<string, string> {
  const [icons, setIcons] = useState<Record<string, string>>({})
  useEffect(() => {
    let live = true
    for (const wallet of [...groups.detected, ...groups.more]) {
      const source = wallet.icon
      if (source === undefined) continue
      void Promise.resolve(typeof source === "string" ? source : source())
        .then((url) => {
          if (live) setIcons((current) => ({ ...current, [wallet.id]: url }))
        })
        .catch(() => undefined)
    }
    return () => {
      live = false
    }
  }, [groups])
  return icons
}

function WalletIcon({
  wallet,
  src,
  size = 40,
  className,
}: {
  wallet: WalletEntry
  src: string | undefined
  size?: number
  className?: string
}): ReactElement {
  if (src === undefined) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[12px] text-body font-700",
          wallet.bitcoin
            ? "bg-accent-soft text-accent-ink"
            : "bg-inset-2 text-secondary",
          className,
        )}
      >
        {wallet.name.slice(0, 1)}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-[12px] bg-inset object-cover", className)}
    />
  )
}

function sublabel(wallet: WalletEntry): string | undefined {
  if (wallet.bitcoin) return "Bitcoin"
  if (wallet.walletConnect && wallet.name !== "WalletConnect") {
    return "WalletConnect"
  }
  return undefined
}

function WalletRow({
  wallet,
  icon,
  onPick,
}: {
  wallet: WalletEntry
  icon: string | undefined
  onPick: (wallet: WalletEntry) => void
}): ReactElement {
  const detail = sublabel(wallet)
  return (
    <button
      type="button"
      onClick={() => onPick(wallet)}
      className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-inset focus-visible:bg-inset"
    >
      <WalletIcon wallet={wallet} src={icon} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-nav font-600 text-ink">
          {wallet.name}
        </span>
        {detail ? (
          <span className="block text-caption text-secondary">{detail}</span>
        ) : null}
      </span>
      {wallet.installed ? (
        <span className="flex items-center gap-1 text-label font-600 text-secondary transition-colors group-hover:text-ink">
          Connect
          <ChevronRight
            aria-hidden="true"
            size={14}
            strokeWidth={2}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      ) : (
        <span className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-caption font-600 text-secondary">
          Get
          <ArrowUpRight aria-hidden="true" size={12} strokeWidth={2} />
          <span className="sr-only"> (opens in a new tab)</span>
        </span>
      )}
    </button>
  )
}

function WalletGroup({
  label,
  wallets,
  icons,
  onPick,
}: {
  label: string
  wallets: readonly WalletEntry[]
  icons: Record<string, string>
  onPick: (wallet: WalletEntry) => void
}): ReactElement | null {
  if (wallets.length === 0) return null
  return (
    <section>
      <h3 className="px-2.5 pb-1.5 text-caption font-600 text-secondary">
        {label}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {wallets.map((wallet) => (
          <li key={wallet.id}>
            <WalletRow
              wallet={wallet}
              icon={icons[wallet.id]}
              onPick={onPick}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Connecting({
  wallet,
  icon,
  error,
  onBack,
  onRetry,
}: {
  wallet: WalletEntry
  icon: string | undefined
  error: string | undefined
  onBack: () => void
  onRetry: () => void
}): ReactElement {
  const failed = error !== undefined
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 px-8 pb-10 text-center">
      <div className="relative mb-1 size-28">
        <svg
          viewBox="0 0 112 112"
          aria-hidden="true"
          className="absolute inset-0"
        >
          <circle
            cx="56"
            cy="56"
            r="54"
            fill="none"
            strokeWidth="2.5"
            className={failed ? "stroke-neg" : "stroke-line"}
          />
          {failed ? null : (
            <circle
              cx="56"
              cy="56"
              r="54"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="104 236"
              className="origin-center animate-spin stroke-ink [animation-duration:1.1s] motion-reduce:animate-none"
            />
          )}
        </svg>
        <WalletIcon
          wallet={wallet}
          src={icon}
          size={64}
          className="absolute inset-6 rounded-[18px]"
        />
      </div>
      <h3
        aria-live="polite"
        className={cn(
          "text-title-sm font-650",
          failed ? "text-neg" : "text-ink",
        )}
      >
        {failed ? "Couldn't connect" : `Opening ${wallet.name}`}
      </h3>
      <p className="text-body-sm text-secondary">
        {error ?? "Confirm in your wallet"}
      </p>
      <div className="mt-2 flex gap-2">
        <Button.Root variant="secondary" size="lg" onClick={onBack}>
          {failed ? "Back" : "Cancel"}
        </Button.Root>
        {failed ? (
          <Button.Root size="lg" onClick={onRetry}>
            Try again
          </Button.Root>
        ) : null}
      </div>
    </div>
  )
}

/** The wallet picker: a floating drawer on desktop, a bottom sheet on phones. */
export default function ConnectDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const { connectors, connectAsync } = useConnect()
  const { connector: current, isConnected } = useAccount()
  const { toast } = Toast.useToast()
  const groups = useMemo(
    () => groupWallets(connectors, walletEnvironment(walletConnectEnabled)),
    [connectors],
  )
  const icons = useWalletIcons(groups)
  const [view, setView] = useState<View>({ kind: "list" })
  // Each attempt gets a number, so a late answer from an abandoned one is
  // ignored.
  const attempt = useRef(0)
  const stopPairing = useRef<(() => void) | null>(null)

  function endPairing(): void {
    stopPairing.current?.()
    stopPairing.current = null
  }

  useEffect(() => () => stopPairing.current?.(), [])

  function back(): void {
    attempt.current += 1
    endPairing()
    setView({ kind: "list" })
  }

  function changeOpen(next: boolean): void {
    onOpenChange(next)
    if (!next) back()
  }

  async function connect(wallet: WalletEntry): Promise<void> {
    if (!wallet.installed) {
      if (wallet.downloadUrl !== undefined) {
        window.open(wallet.downloadUrl, "_blank", "noopener,noreferrer")
      }
      return
    }
    if (isConnected && current?.uid === wallet.connector.uid) {
      changeOpen(false)
      return
    }
    attempt.current += 1
    const run = attempt.current
    endPairing()
    setView({ kind: "connecting", wallet })
    if (wallet.walletConnect) {
      // The connector runs with its own modal off; it hands us the pairing
      // URI as a `display_uri` message and the drawer draws the QR itself.
      preloadQrEncoder()
      const onMessage = (message: { type: string; data?: unknown }): void => {
        if (
          attempt.current === run &&
          message.type === "display_uri" &&
          typeof message.data === "string"
        ) {
          setView({ kind: "connecting", wallet, uri: message.data })
        }
      }
      const { emitter } = wallet.connector
      emitter.on("message", onMessage)
      stopPairing.current = () => emitter.off("message", onMessage)
    }
    try {
      const { accounts } = await connectAsync({ connector: wallet.connector })
      if (attempt.current !== run) return
      changeOpen(false)
      const account = accounts[0]
      toast({
        title: "Wallet connected",
        tone: "success",
        ...(account ? { description: shortenAddress(account) } : {}),
      })
    } catch (error) {
      if (attempt.current !== run) return
      endPairing()
      setView({ kind: "connecting", wallet, error: connectError(error) })
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Content
        placement="drawer"
        hideClose
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          if (view.kind !== "connecting") return
          event.preventDefault()
          back()
        }}
        overlayClassName="sm:p-3"
        className="overflow-hidden px-0 pb-0 pt-2.5 sm:rounded-2xl sm:border sm:border-line sm:px-0 sm:pt-0 sm:data-[state=open]:animate-drawer-in"
        columnClassName="min-h-0 flex-1 gap-0"
      >
        <header className="flex items-center gap-2 py-3 pl-5 pr-3 sm:py-4">
          {view.kind === "connecting" ? (
            <button
              type="button"
              aria-label="Back to wallets"
              onClick={back}
              className="-ml-2 flex size-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-inset hover:text-ink"
            >
              <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
            </button>
          ) : null}
          <Dialog.Title>Connect wallet</Dialog.Title>
          <Dialog.Close
            aria-label="Close"
            className="ml-auto flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-inset hover:text-ink"
          >
            <X aria-hidden="true" size={16} strokeWidth={1.75} />
          </Dialog.Close>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view.kind === "connecting" ? (
            view.wallet.walletConnect && view.error === undefined ? (
              <WalletConnectPairing wallet={view.wallet} uri={view.uri} />
            ) : (
              <Connecting
                wallet={view.wallet}
                icon={icons[view.wallet.id]}
                error={view.error}
                onBack={back}
                onRetry={() => void connect(view.wallet)}
              />
            )
          ) : groups.detected.length === 0 && groups.more.length === 0 ? (
            <p className="px-5 py-10 text-center text-body-sm text-secondary">
              No wallets found
            </p>
          ) : (
            <div className="flex flex-col gap-4 px-2.5 pb-4 pt-1">
              <WalletGroup
                label="Detected"
                wallets={groups.detected}
                icons={icons}
                onPick={(wallet) => void connect(wallet)}
              />
              <WalletGroup
                label={groups.detected.length > 0 ? "More wallets" : "Wallets"}
                wallets={groups.more}
                icons={icons}
                onPick={(wallet) => void connect(wallet)}
              />
            </div>
          )}
        </div>

        <footer className="border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5 text-caption text-secondary">
          <a
            className="font-600 text-ink-2 underline-offset-2 hover:text-ink hover:underline"
            href={TERMS_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            Terms
          </a>
          {" · "}
          <a
            className="font-600 text-ink-2 underline-offset-2 hover:text-ink hover:underline"
            href={PRIVACY_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            Privacy
          </a>
        </footer>
      </Dialog.Content>
    </Dialog.Root>
  )
}
