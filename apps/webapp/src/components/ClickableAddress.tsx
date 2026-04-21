import { getExplorerAddressUrl } from "@/config/explorer"
import { useNetwork } from "@/contexts/NetworkContext"
import { useState } from "react"
import type { Address } from "viem"

type ClickableAddressProps = {
  address: Address
  label?: string
  className?: string
}

function CopyIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
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

function CheckIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
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

function ExternalIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
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

export function ClickableAddress({
  address,
  label,
  className,
}: ClickableAddressProps): JSX.Element {
  const { chainId } = useNetwork()
  const explorerUrl = getExplorerAddressUrl(chainId, address)
  const [copied, setCopied] = useState(false)
  const short = label ?? `${address.slice(0, 8)}…${address.slice(-6)}`

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // clipboard access denied — ignore silently
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-2xs ${className ?? ""}`}
      title={address}
    >
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--content-secondary)] no-underline transition-colors hover:text-[#F7931A] hover:underline"
      >
        {short}
      </a>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy address"}
        className="relative inline-flex h-5 w-5 items-center justify-center rounded text-[var(--content-tertiary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[#F7931A]"
      >
        <span
          className={`absolute transition-all duration-200 ${
            copied ? "scale-0 opacity-0" : "scale-100 opacity-100"
          }`}
        >
          <CopyIcon />
        </span>
        <span
          className={`absolute text-[var(--positive)] transition-all duration-200 ${
            copied ? "scale-100 opacity-100" : "scale-50 opacity-0"
          }`}
        >
          <CheckIcon />
        </span>
      </button>
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View on explorer"
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--content-tertiary)] no-underline transition-colors hover:bg-[var(--surface-secondary)] hover:text-[#F7931A]"
      >
        <ExternalIcon />
      </a>
    </span>
  )
}
