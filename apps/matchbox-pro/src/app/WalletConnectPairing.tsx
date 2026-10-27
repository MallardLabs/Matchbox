import { useMediaQuery } from "@/hooks/useMediaQuery"
import {
  type QrCode,
  encodeQr,
  walletConnectLinks,
} from "@/lib/wallet/walletConnectPairing"
import type { WalletEntry } from "@/lib/wallet/wallets"
import * as Button from "@repo/ui/button"
import * as Skeleton from "@repo/ui/skeleton"
import { useCopy } from "@repo/ui/use-copy"
import { Check, Copy, ExternalLink } from "lucide-react"
import { type ReactElement, useEffect, useState } from "react"

// Phones (or touch-first tablets) get wallet links first; a QR there would
// have to be scanned by the same device.
const HANDHELD_QUERY = "(max-width: 639px), (pointer: coarse)"

/** The pairing QR: dark modules on a light card in both themes. */
function PairingQr({ uri }: { uri: string | undefined }): ReactElement {
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
    <div className="light rounded-[20px] border border-line bg-surface p-4">
      {code ? (
        <svg
          role="img"
          aria-label="WalletConnect QR code"
          viewBox={`0 0 ${code.size} ${code.size}`}
          shapeRendering="crispEdges"
          className="block size-[216px] fill-ink"
        >
          <path d={code.path} />
        </svg>
      ) : failed ? (
        <p className="m-0 flex size-[216px] items-center justify-center text-body-sm text-secondary">
          QR unavailable
        </p>
      ) : (
        <div aria-busy="true" aria-label="Preparing QR code">
          <Skeleton.Root className="size-[216px] rounded-md" />
        </div>
      )}
    </div>
  )
}

function AppLinks({
  wallet,
  uri,
}: {
  wallet: WalletEntry
  uri: string | undefined
}): ReactElement {
  return (
    <ul
      aria-label="Wallet apps"
      className="m-0 flex w-full list-none flex-col gap-0.5 p-0 text-left"
    >
      {uri
        ? walletConnectLinks(
            uri,
            wallet.appUri
              ? { name: wallet.name, href: wallet.appUri(uri) }
              : undefined,
          ).map((link) => (
            <li key={link.name}>
              <a
                href={link.href}
                rel="noreferrer noopener"
                className="flex h-11 w-full items-center justify-between rounded-xl px-2.5 text-nav font-600 text-ink transition-colors hover:bg-inset focus-visible:bg-inset"
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
              <Skeleton.Root className="h-11 rounded-xl" />
            </li>
          ))}
    </ul>
  )
}

function CopyLink({ uri }: { uri: string | undefined }): ReactElement {
  const { state, copy } = useCopy(uri ?? "")
  return (
    <>
      <Button.Root
        variant="secondary"
        size="lg"
        disabled={!uri}
        onClick={() => void copy()}
      >
        {state === "copied" ? (
          <Check aria-hidden="true" size={14} strokeWidth={2} />
        ) : (
          <Copy aria-hidden="true" size={14} strokeWidth={1.75} />
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

/**
 * WalletConnect pairing inside the connect drawer: the QR code on desktop,
 * wallet app links first on phones.
 */
export default function WalletConnectPairing({
  wallet,
  uri,
}: {
  wallet: WalletEntry
  uri: string | undefined
}): ReactElement {
  const handheld = useMediaQuery(HANDHELD_QUERY)
  const [showQr, setShowQr] = useState(false)
  const target = wallet.name === "WalletConnect" ? "your wallet" : wallet.name
  const qrValue = uri === undefined ? undefined : (wallet.qrUri?.(uri) ?? uri)

  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 px-8 pb-10 pt-2 text-center">
      {handheld ? (
        <>
          <h3 className="text-title-sm font-650 text-ink">Open {target}</h3>
          <AppLinks wallet={wallet} uri={uri} />
          {showQr ? <PairingQr uri={qrValue} /> : null}
        </>
      ) : (
        <>
          <PairingQr uri={qrValue} />
          <h3 className="text-title-sm font-650 text-ink">
            Scan with {target}
          </h3>
        </>
      )}
      <output aria-live="polite" className="sr-only">
        {uri ? "Waiting for wallet" : "Preparing link"}
      </output>
      <div className="flex flex-wrap justify-center gap-2">
        {handheld ? (
          <Button.Root
            variant="secondary"
            size="lg"
            aria-expanded={showQr}
            onClick={() => setShowQr((value) => !value)}
          >
            {showQr ? "Hide QR" : "Show QR"}
          </Button.Root>
        ) : (
          <Button.Root asChild variant="secondary" size="lg" disabled={!uri}>
            <a href={uri} rel="noreferrer noopener">
              <ExternalLink aria-hidden="true" size={14} strokeWidth={1.75} />
              Open app
            </a>
          </Button.Root>
        )}
        <CopyLink uri={uri} />
      </div>
    </div>
  )
}
