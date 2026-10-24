import {
  type EnvironmentKind,
  type NetworkSlug,
  networkNames,
} from "@repo/platform-contracts/network"
import * as Badge from "@repo/ui/badge"
import { cn } from "@repo/ui/cn"
import type { ReactElement } from "react"

/** "Live · Mezo" (green dot) or "Test" / "Test · Mezo Testnet" (grey dot). */
export default function EnvChip({
  kind,
  network,
  compact = false,
}: {
  kind: EnvironmentKind
  network: NetworkSlug
  /** Test environments drop the network name (connected-apps table). */
  compact?: boolean
}): ReactElement {
  const live = kind === "live"
  return (
    <Badge.Root className="font-600">
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", live ? "bg-pos" : "bg-faint")}
      />
      {live ? "Live" : "Test"}
      {compact && !live ? null : ` · ${networkNames[network]}`}
    </Badge.Root>
  )
}
