import { useMediaQuery } from "@/hooks/useMediaQuery"
import { walletConnectEnabled } from "@/lib/wallet/config"
import {
  type QrCode,
  encodeQr,
  preloadQrEncoder,
  walletConnectLinks,
} from "@/lib/wallet/walletConnectPairing"
import { describeWriteError } from "@/lib/writeErrors"
import * as Button from "@repo/ui/button"
import * as Dialog from "@repo/ui/dialog"
import * as Skeleton from "@repo/ui/skeleton"
import * as Toast from "@repo/ui/toast"
import { useCopy } from "@repo/ui/use-copy"
import { shortenAddress } from "@repo/ui/wallet-address"
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink } from "lucide-react"
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { type Connector, useConnect } from "wagmi"

const TERMS_URL = "https://mezo.org/legal/terms"
const PRIVACY_URL = "https://mezo.org/legal/privacy"
// Phones (or touch-first tablets) get wallet links first; a QR there would
// have to be scanned by the same device.
const HANDHELD_QUERY = "(max-width: 639px), (pointer: coarse)"

type ConnectDialogContextValue = { open: () => void }

const ConnectDialogContext = createContext<ConnectDialogContextValue | null>(
  null,
)

export function useConnectDialog(): ConnectDialogContextValue {
  const value = useContext(ConnectDialogContext)
  if (!value) {
    throw new Error(
      "useConnectDialog must be used inside <ConnectDialogProvider>",
    )
  }
  return value
}

export function ConnectDialogProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const value = useMemo(() => ({ open }), [open])
  return (
    <ConnectDialogContext.Provider value={value}>
      {children}
      <ConnectDialog open={isOpen} onOpenChange={setIsOpen} />
    </ConnectDialogContext.Provider>
  )
}

function ConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const { connectors, connect, error, reset } = useConnect()
  const { toast } = Toast.useToast()
  const [pending, setPending] = useState<Connector | null>(null)
  const [pairingUri, setPairingUri] = useState<string | null>(null)
  const stopListening = useRef<(() => void) | null>(null)

  // Without a project id WalletConnect can't pair; don't offer a dead option.
  const visible = connectors.filter(
    (connector, index, list) =>
      list.findIndex((item) => item.id === connector.id) === index &&
      (walletConnectEnabled || connector.type !== "walletConnect"),
  )

  const endPairing = useCallback(() => {
    stopListening.current?.()
    stopListening.current = null
    setPairingUri(null)
  }, [])

  useEffect(() => endPairing, [endPairing])

  function choose(connector: Connector): void {
    setPending(connector)
    if (connector.type === "walletConnect") {
      // The connector runs with its own modal off; it hands us the pairing
      // URI as a `display_uri` message and we draw the QR ourselves.
      preloadQrEncoder()
      endPairing()
      const onMessage = (message: { type: string; data?: unknown }): void => {
        if (
          message.type === "display_uri" &&
          typeof message.data === "string"
        ) {
          setPairingUri(message.data)
        }
      }
      connector.emitter.on("message", onMessage)
      stopListening.current = () => connector.emitter.off("message", onMessage)
    }
    connect(
      { connector },
      {
        onSuccess: (data) => {
          onOpenChange(false)
          const account = data.accounts[0]
          toast({
            title: "Wallet connected",
            tone: "success",
            ...(account
              ? {
                  description: `${shortenAddress(account)} can vote, claim, and manage locks.`,
                }
              : {}),
          })
        },
        onSettled: () => {
          endPairing()
          setPending(null)
        },
      },
    )
  }

  function chooseAgain(): void {
    endPairing()
    reset()
    setPending(null)
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) chooseAgain()
        onOpenChange(next)
      }}
    >
      <Dialog.Content aria-describedby={undefined} size="sm">
        {pending?.type === "walletConnect" ? (
          <WalletConnectPairing uri={pairingUri} onBack={chooseAgain} />
        ) : pending ? (
          <>
            <Dialog.Header>
              <Dialog.Title>Waiting for {pending.name}</Dialog.Title>
              <p className="text-body-sm text-secondary">
                Confirm the connection in your wallet.
              </p>
            </Dialog.Header>
            <output className="flex h-[72px] items-center justify-center text-body font-500 text-accent-ink">
              Connecting…
            </output>
            <button
              type="button"
              onClick={chooseAgain}
              className="flex items-center gap-1.5 self-start text-label font-500 text-secondary transition-colors hover:text-ink"
            >
              <ArrowLeft aria-hidden="true" size={13} strokeWidth={1.75} />
              Choose a different wallet
            </button>
          </>
        ) : (
          <>
            <Dialog.Header>
              <Dialog.Title>Connect wallet</Dialog.Title>
            </Dialog.Header>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {visible.map((connector) => (
                <li key={connector.uid}>
                  <button
                    type="button"
                    onClick={() => choose(connector)}
                    className="flex h-11 w-full items-center justify-between rounded-lg bg-inset px-3 text-left text-body font-600 text-ink transition-colors hover:bg-inset-2"
                  >
                    <span className="flex items-center gap-2.5">
                      {connector.icon ? (
                        <img
                          src={connector.icon}
                          alt=""
                          className="size-5 rounded"
                        />
                      ) : null}
                      {connector.name === "Injected"
                        ? "Browser wallet"
                        : connector.name}
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      size={15}
                      strokeWidth={1.75}
                      className="text-muted"
                    />
                  </button>
                </li>
              ))}
            </ul>
            {error ? (
              <p role="alert" className="text-body-sm text-neg">
                {describeWriteError(error).message}
              </p>
            ) : null}
            <p className="text-caption text-secondary">
              By connecting you agree to the Terms of Service and Privacy
              Policy.
            </p>
            <p className="flex gap-3 text-label">
              <a
                className="font-600 text-accent-ink underline-offset-2 hover:underline"
                href={TERMS_URL}
                target="_blank"
                rel="noreferrer"
              >
                Terms of Service
              </a>
              <a
                className="font-600 text-accent-ink underline-offset-2 hover:underline"
                href={PRIVACY_URL}
                target="_blank"
                rel="noreferrer"
              >
                Privacy Policy
              </a>
            </p>
          </>
        )}
      </Dialog.Content>
    </Dialog.Root>
  )
}

function WalletConnectPairing({
  uri,
  onBack,
}: {
  uri: string | null
  onBack: () => void
}): ReactElement {
  const handheld = useMediaQuery(HANDHELD_QUERY)
  const [showQr, setShowQr] = useState(false)
  const qrVisible = !handheld || showQr
  const links = uri ? walletConnectLinks(uri) : []

  return (
    <>
      <Dialog.Header>
        <Dialog.Title>WalletConnect</Dialog.Title>
        <p className="text-body-sm text-secondary">
          {handheld ? "Open your wallet" : "Scan with your wallet"}
        </p>
      </Dialog.Header>

      {handheld ? (
        <ul
          aria-label="Wallets"
          className="m-0 flex list-none flex-col gap-2 p-0"
        >
          {uri
            ? links.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    rel="noreferrer noopener"
                    className="flex h-11 w-full items-center justify-between rounded-lg bg-inset px-3 text-body font-600 text-ink transition-colors hover:bg-inset-2"
                  >
                    {link.name}
                    <ExternalLink
                      aria-hidden="true"
                      size={15}
                      strokeWidth={1.75}
                      className="text-muted"
                    />
                  </a>
                </li>
              ))
            : ["a", "b", "c"].map((key) => (
                <li key={key}>
                  <Skeleton.Root className="h-11 rounded-lg" />
                </li>
              ))}
        </ul>
      ) : null}

      {qrVisible ? <PairingQr uri={uri} /> : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <output
          aria-live="polite"
          className="mr-auto text-body-sm font-500 text-accent-ink"
        >
          {uri ? "Waiting for wallet" : "Preparing link…"}
        </output>
        {handheld ? (
          <Button.Root
            variant="ghost"
            size="lg"
            aria-expanded={showQr}
            onClick={() => setShowQr((value) => !value)}
            className="h-11 px-3"
          >
            {showQr ? "Hide QR" : "Show QR"}
          </Button.Root>
        ) : null}
        <CopyLink uri={uri} />
      </div>

      <button
        type="button"
        onClick={onBack}
        className="flex h-11 items-center gap-1.5 self-start text-label font-500 text-secondary transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" size={13} strokeWidth={1.75} />
        Choose a different wallet
      </button>
    </>
  )
}

/** The pairing QR: dark modules on a light card in both themes. */
function PairingQr({ uri }: { uri: string | null }): ReactElement {
  const [qr, setQr] = useState<{ uri: string; code: QrCode } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!uri) return
    let live = true
    setFailed(false)
    encodeQr(uri)
      .then((code) => {
        if (live) setQr({ uri, code })
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [uri])

  const code = qr && qr.uri === uri ? qr.code : null

  return (
    // `light` keeps the card on the light tokens in dark mode too.
    <div className="light mx-auto rounded-xl border border-line bg-surface p-3">
      {code ? (
        <svg
          role="img"
          aria-label="WalletConnect QR code"
          viewBox={`0 0 ${code.size} ${code.size}`}
          shapeRendering="crispEdges"
          className="block size-[232px] fill-ink"
        >
          <path d={code.path} />
        </svg>
      ) : failed ? (
        <p className="m-0 flex size-[232px] items-center justify-center text-center text-body-sm text-secondary">
          QR unavailable
        </p>
      ) : (
        <div aria-busy="true" aria-label="Preparing QR code">
          <Skeleton.Root className="size-[232px] rounded-md" />
        </div>
      )}
    </div>
  )
}

function CopyLink({ uri }: { uri: string | null }): ReactElement {
  const { state, copy } = useCopy(uri ?? "")
  return (
    <>
      <Button.Root
        variant="secondary"
        size="lg"
        disabled={!uri}
        onClick={() => void copy()}
        className="h-11 px-3"
      >
        {state === "copied" ? (
          <Check aria-hidden="true" size={15} strokeWidth={2} />
        ) : (
          <Copy aria-hidden="true" size={15} strokeWidth={1.75} />
        )}
        {state === "copied"
          ? "Copied"
          : state === "failed"
            ? "Copy failed"
            : "Copy link"}
      </Button.Root>
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? "Link copied" : ""}
      </span>
    </>
  )
}
