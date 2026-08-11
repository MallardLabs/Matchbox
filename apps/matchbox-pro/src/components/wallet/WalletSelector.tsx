import {
  CheckIcon,
  CloseIcon,
  ShieldIcon,
  WalletIcon,
} from "@/components/ui/Icons"
import { mezoMainnet } from "@/lib/wallet/config"
import { type WatchedWallet, shortenAddress } from "@/lib/wallet/selection"
import type { WalletSelection } from "@/lib/wallet/useWalletSelection"
import { cn } from "@/utils/cn"
import * as Dialog from "@radix-ui/react-dialog"
import { useConnectModal } from "@rainbow-me/rainbowkit"
import { type FormEvent, useState } from "react"
import { useAccount, useSwitchChain } from "wagmi"

type WalletSelectorProps = {
  activeWallet: WalletSelection | null
  onAddWatchedWallet: (input: {
    address: string
    label?: string
  }) => WalletSelection
  onDisconnect: () => void
  onOpenChange: (open: boolean) => void
  onSelectConnected: () => void
  onSelectWatched: (wallet: WatchedWallet) => void
  open: boolean
  watchedWallets: WatchedWallet[]
}

export default function WalletSelector({
  activeWallet,
  onAddWatchedWallet,
  onDisconnect,
  onOpenChange,
  onSelectConnected,
  onSelectWatched,
  open,
  watchedWallets,
}: WalletSelectorProps) {
  const account = useAccount()
  const { openConnectModal } = useConnectModal()
  const {
    error: switchError,
    isPending: switching,
    switchChain,
  } = useSwitchChain()
  const [address, setAddress] = useState("")
  const [label, setLabel] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  function connectWallet(): void {
    onOpenChange(false)
    openConnectModal?.()
  }

  function addWatchedWallet(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setFormError(null)
    try {
      onAddWatchedWallet({
        address,
        ...(label.trim() ? { label } : {}),
      })
      setAddress("")
      setLabel("")
      onOpenChange(false)
    } catch {
      setFormError("Enter a valid 0x EVM wallet address.")
    }
  }

  const connectedSelected =
    activeWallet?.mode === "connected" &&
    activeWallet.address.toLowerCase() === account.address?.toLowerCase()
  const onMezo = account.chainId === mezoMainnet.id

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-[7vh] z-50 max-h-[86dvh] w-[min(620px,calc(100%-24px))] -translate-x-1/2 overflow-y-auto rounded-xl border border-line bg-panel shadow-2xl">
          <header className="flex items-start gap-4 border-b border-line p-5 sm:p-6">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
              <WalletIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-balance text-lg font-medium text-ink">
                Choose Stuart's wallet context
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-pretty text-sm leading-6 text-secondary">
                Stuart answers for the selected address. Only the connected
                wallet can prepare actions for wallet confirmation.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close wallet selector"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink"
            >
              <CloseIcon className="size-4" />
            </Dialog.Close>
          </header>

          <div className="space-y-7 p-5 sm:p-6">
            <section aria-labelledby="connected-wallet-heading">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2
                  className="text-balance text-sm font-medium text-ink"
                  id="connected-wallet-heading"
                >
                  Connected wallet
                </h2>
                {account.isConnected && (
                  <button
                    className="button-ghost min-h-8 px-2 text-xs"
                    onClick={onDisconnect}
                    type="button"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {account.isConnected && account.address ? (
                <div className="rounded-lg border border-line bg-canvas p-3">
                  <button
                    aria-pressed={connectedSelected}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-raised",
                      connectedSelected && "bg-raised",
                    )}
                    onClick={() => {
                      onSelectConnected()
                      onOpenChange(false)
                    }}
                    type="button"
                  >
                    <span className="inline-flex size-9 items-center justify-center rounded-md bg-positive-soft text-positive">
                      <WalletIcon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">
                        {account.connector?.name ?? "Connected wallet"}
                      </span>
                      <span className="block truncate font-mono text-xs tabular-nums text-muted">
                        {account.address}
                      </span>
                    </span>
                    {connectedSelected && (
                      <CheckIcon className="size-4 shrink-0 text-positive" />
                    )}
                  </button>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line px-2 pt-3">
                    <p className="text-xs text-muted">
                      {onMezo
                        ? "Ready on Mezo Mainnet"
                        : "Connected on another network"}
                    </p>
                    {!onMezo && (
                      <button
                        className="button-secondary min-h-8 px-3 text-xs"
                        disabled={switching}
                        onClick={() => switchChain({ chainId: mezoMainnet.id })}
                        type="button"
                      >
                        {switching ? "Switching…" : "Switch to Mezo"}
                      </button>
                    )}
                  </div>
                  {switchError && (
                    <p
                      className="mt-2 px-2 text-pretty text-xs text-negative"
                      role="alert"
                    >
                      Your wallet could not switch to Mezo. Open it and try
                      again.
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-line bg-canvas p-5 text-center">
                  <p className="text-pretty text-sm text-secondary">
                    Connect a browser or mobile wallet to let Stuart prepare
                    unsigned actions for your address.
                  </p>
                  <button
                    className="button-primary mt-4"
                    onClick={connectWallet}
                    type="button"
                  >
                    <WalletIcon className="size-4" />
                    Connect wallet
                  </button>
                </div>
              )}
            </section>

            <section aria-labelledby="watched-wallet-heading">
              <h2
                className="text-balance text-sm font-medium text-ink"
                id="watched-wallet-heading"
              >
                Watched wallets
              </h2>
              <p className="mt-1 text-pretty text-xs leading-5 text-muted">
                Watch any public EVM address without connecting it. Watched
                wallets are always read-only.
              </p>

              {watchedWallets.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {watchedWallets.map((wallet) => {
                    const selected =
                      activeWallet?.mode === "watching" &&
                      activeWallet.address.toLowerCase() ===
                        wallet.address.toLowerCase()
                    return (
                      <li key={wallet.address}>
                        <button
                          aria-pressed={selected}
                          className={cn(
                            "flex min-h-12 w-full items-center gap-3 rounded-md border border-line bg-canvas px-3 text-left hover:bg-raised",
                            selected && "border-accent/60 bg-raised",
                          )}
                          onClick={() => {
                            onSelectWatched(wallet)
                            onOpenChange(false)
                          }}
                          type="button"
                        >
                          <ShieldIcon className="size-4 shrink-0 text-warning" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink">
                              {wallet.label}
                            </span>
                            <span className="block font-mono text-xs tabular-nums text-muted sm:hidden">
                              {shortenAddress(wallet.address)}
                            </span>
                            <span className="hidden truncate font-mono text-xs tabular-nums text-muted sm:block">
                              {wallet.address}
                            </span>
                          </span>
                          <span className="rounded bg-warning-soft px-2 py-1 text-[10px] font-medium text-warning">
                            WATCH ONLY
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              <form className="mt-4" onSubmit={addWatchedWallet}>
                <fieldset>
                  <legend className="sr-only">Add a watched wallet</legend>
                  <ol className="space-y-3">
                    <li>
                      <label
                        className="mb-1.5 block text-xs font-medium text-secondary"
                        htmlFor="watched-wallet-address"
                      >
                        Wallet address
                      </label>
                      <input
                        aria-describedby="watched-wallet-privacy"
                        autoComplete="off"
                        className="field w-full font-mono tabular-nums"
                        id="watched-wallet-address"
                        onChange={(event) => setAddress(event.target.value)}
                        placeholder="0x…"
                        required
                        spellCheck={false}
                        value={address}
                      />
                    </li>
                    <li>
                      <label
                        className="mb-1.5 block text-xs font-medium text-secondary"
                        htmlFor="watched-wallet-label"
                      >
                        Label <span className="text-muted">(optional)</span>
                      </label>
                      <input
                        className="field w-full"
                        id="watched-wallet-label"
                        maxLength={80}
                        onChange={(event) => setLabel(event.target.value)}
                        placeholder="Treasury, validator, friend…"
                        value={label}
                      />
                    </li>
                  </ol>
                </fieldset>

                {formError && (
                  <p
                    className="mt-2 text-pretty text-xs text-negative"
                    role="alert"
                  >
                    {formError}
                  </p>
                )}

                <div
                  className="mt-4 rounded-md border border-warning/30 bg-warning-soft p-3"
                  id="watched-wallet-privacy"
                >
                  <p className="text-pretty text-xs leading-5 text-secondary">
                    <strong className="font-medium text-warning">
                      Privacy notice:
                    </strong>{" "}
                    Matchbox will query public indexed and on-chain activity for
                    this address. Never enter a seed phrase or private key.
                  </p>
                </div>

                <button
                  className="button-secondary mt-4 w-full"
                  disabled={!address.trim()}
                  type="submit"
                >
                  <ShieldIcon className="size-4" />
                  Watch this wallet
                </button>
              </form>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
