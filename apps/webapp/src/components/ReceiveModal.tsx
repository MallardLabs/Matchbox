import { useNetwork } from "@/contexts/NetworkContext"
import { Button, Modal, ModalBody, ModalHeader } from "@mezo-org/mezo-clay"
import { useWalletAccount } from "@mezo-org/passport"
import { QRCodeSVG } from "qrcode.react"
import { useCallback, useState } from "react"

function CheckIcon(): JSX.Element {
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
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function CopyIcon(): JSX.Element {
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
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

type ReceiveModalProps = {
  isOpen: boolean
  onClose: () => void
}

export function ReceiveModal({
  isOpen,
  onClose,
}: ReceiveModalProps): JSX.Element {
  const { accountAddress } = useWalletAccount()
  const { isMainnet } = useNetwork()
  const [copied, setCopied] = useState(false)

  const explorerBaseUrl = isMainnet
    ? "https://explorer.mezo.org"
    : "https://explorer.testnet.mezo.org"

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

  const handleClose = useCallback(() => {
    setCopied(false)
    onClose()
  }, [onClose])

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      overrides={{
        Dialog: {
          style: {
            maxWidth: "400px",
            width: "100%",
          },
        },
      }}
    >
      <ModalHeader>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
            aria-label="Close"
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
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <span>Scan to receive</span>
        </div>
      </ModalHeader>
      <ModalBody>
        <div className="flex flex-col items-center">
          {/* Description */}
          <div className="mb-6 text-center">
            <h3 className="mb-1 text-base font-semibold text-[var(--content-primary)]">
              Your Mezo Address
            </h3>
            <p className="text-sm text-[var(--content-secondary)]">
              Your connected wallet address is your Mezo address. Use this
              address to receive assets on Mezo.
            </p>
          </div>

          {/* QR Code */}
          {accountAddress && (
            <div className="mb-6 rounded-2xl bg-white p-4">
              <QRCodeSVG
                value={accountAddress}
                size={200}
                level="H"
                includeMargin={false}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>
          )}

          {/* Address display */}
          {accountAddress && (
            <div className="mb-6 flex w-full items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3">
              <img
                src="/token icons/Mezo.svg"
                alt="Mezo"
                className="h-5 w-5 rounded-full"
              />
              <span className="font-mono text-sm text-[var(--content-primary)]">
                {accountAddress.slice(0, 6)}...{accountAddress.slice(-4)}
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex w-full flex-col gap-3">
            <Button
              onClick={handleCopy}
              kind="primary"
              overrides={{ Root: { style: { width: "100%" } } }}
            >
              <span className="flex items-center justify-center gap-2">
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? "Copied!" : "Copy Mezo address"}
              </span>
            </Button>

            <Button
              onClick={handleViewExplorer}
              kind="tertiary"
              overrides={{ Root: { style: { width: "100%" } } }}
            >
              <span className="flex items-center justify-center gap-2">
                <ExternalLinkIcon />
                View Mezo explorer
              </span>
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  )
}
