import {
  networkForChainId,
  networkNames,
} from "@repo/platform-contracts/network"
import * as Badge from "@repo/ui/badge"
import type { ReactElement } from "react"

/** Mezo network name for a wallet chain id; a warning chip otherwise. */
export default function NetworkLabel({
  chainId,
}: {
  chainId: number | undefined
}): ReactElement {
  if (chainId === undefined) {
    return <span className="text-secondary">—</span>
  }
  const network = networkForChainId(chainId)
  if (network === null) {
    return (
      <Badge.Root tone="warn" dot>
        Unsupported
      </Badge.Root>
    )
  }
  return <span className="font-600 text-ink">{networkNames[network]}</span>
}
