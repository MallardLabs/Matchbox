import {
  networkForChainId,
  networkNames,
} from "@repo/platform-contracts/network"
import * as Badge from "@repo/ui/badge"
import { cn } from "@repo/ui/cn"
import type { ReactElement } from "react"

/** Wallet chain as a chip: Mezo network name, or "Unsupported". */
export default function NetworkChip({
  chainId,
}: {
  chainId: number | undefined
}): ReactElement {
  const network = chainId === undefined ? null : networkForChainId(chainId)
  if (network === null) {
    return (
      <Badge.Root tone="warn" dot>
        {chainId === undefined ? "No network" : "Unsupported"}
      </Badge.Root>
    )
  }
  return (
    <Badge.Root className="font-600">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          network === "mezo" ? "bg-pos" : "bg-faint",
        )}
      />
      {networkNames[network]}
    </Badge.Root>
  )
}
