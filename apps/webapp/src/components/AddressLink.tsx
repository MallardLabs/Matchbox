import { useNetwork } from "@/contexts/NetworkContext"
import { LinkExternal02 } from "@mezo-org/mezo-clay"
import type { Address } from "viem"

type AddressLinkProps = {
  address: Address
  label?: string
}

export function AddressLink({ address, label }: AddressLinkProps): JSX.Element {
  const { isMainnet } = useNetwork()
  const baseUrl = isMainnet
    ? "https://explorer.mezo.org"
    : "https://explorer.test.mezo.org"
  const explorerUrl = `${baseUrl}/address/${address}`
  const shortAddress = `0x${address.slice(2, 6)}...${address.slice(-4)}`

  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-sm text-[var(--content-primary)] no-underline transition-colors hover:text-[#F7931A] hover:underline"
    >
      {label ?? shortAddress}
      <LinkExternal02 size={16} />
    </a>
  )
}
