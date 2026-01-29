import { useNetwork } from "@/contexts/NetworkContext"
import { useWalletAccount } from "@mezo-org/passport"
import { QRCodeSVG } from "qrcode.react"
import { useCallback, useState } from "react"

function CheckIcon(): JSX.Element {
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function CopyIcon(): JSX.Element {
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
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function ExternalLinkIcon(): JSX.Element {
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
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

type ReceiveViewProps = {
  onBack: () => void
}

export function ReceiveView({ onBack: _onBack }: ReceiveViewProps): JSX.Element {
  const { accountAddress } = useWalletAccount()
  const { isMainnet } = useNetwork()
  const [copied, setCopied] = useState(false)

  const explorerBaseUrl = isMainnet
    ? "https://explorer.mezo.org"
    : "https://explorer.test.mezo.org"

  const handleCopy = useCallback(async () => {
    if (!accountAddress) return
    try {
      await navigator.clipboard.writeText(accountAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy address:", err)
    }
  }, [accountAddress])

  const handleViewExplorer = useCallback(() => {
    if (!accountAddress) return
    window.open(`${explorerBaseUrl}/address/${accountAddress}`, "_blank")
  }, [accountAddress, explorerBaseUrl])

  return (
    <div className="flex flex-1 flex-col items-center px-4">
      {/* Header Section */}
      <div className="mb-6 text-center">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[var(--surface-secondary)] border border-[var(--border)] px-4 py-2">
          <img
            src="/token icons/Mezo.svg"
            alt="Mezo"
            className="h-5 w-5 rounded-full"
          />
          <span className="text-sm font-semibold text-[var(--content-primary)]">
            Mezo {isMainnet ? "Mainnet" : "Testnet"}
          </span>
        </div>
        <h3 className="mb-1 text-xl font-bold text-[var(--content-primary)]">
          Your Mezo Address
        </h3>
        <p className="text-sm text-[var(--content-secondary)]">
          Scan or share to receive assets
        </p>
      </div>

      {/* QR Code Card */}
      {accountAddress && (
        <div className="mb-6 overflow-hidden rounded-3xl border border-[var(--border)] bg-white p-1 shadow-lg">
          <div className="rounded-[22px] bg-white p-6">
            <QRCodeSVG
              value={accountAddress}
              size={200}
              level="H"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#000000"
              imageSettings={{
                src: "/token icons/Mezo.svg",
                height: 40,
                width: 40,
                excavate: true,
              }}
            />
          </div>
        </div>
      )}

      {/* Address Display */}
      {accountAddress && (
        <button
          type="button"
          onClick={handleCopy}
          className="mb-6 flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3 transition-all hover:border-[var(--accent)] hover:bg-[var(--surface)]"
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]">
              <img
                src="/token icons/Mezo.svg"
                alt="Mezo"
                className="h-6 w-6"
              />
            </div>
            <span className="truncate font-mono text-sm text-[var(--content-primary)]">
              {accountAddress}
            </span>
          </div>
          <span
            className={`shrink-0 transition-colors ${copied ? "text-green-500" : "text-[var(--content-secondary)]"}`}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </span>
        </button>
      )}

      {/* Action Buttons */}
      <div className="mt-auto flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 font-semibold text-white transition-all hover:opacity-90"
        >
          {copied ? (
            <>
              <CheckIcon />
              Copied!
            </>
          ) : (
            <>
              <CopyIcon />
              Copy Address
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleViewExplorer}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-4 font-semibold text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
        >
          <ExternalLinkIcon />
          View on Explorer
        </button>
      </div>
    </div>
  )
}
