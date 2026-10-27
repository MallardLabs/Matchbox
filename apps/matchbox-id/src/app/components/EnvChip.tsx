import {
  type EnvironmentKind,
  type NetworkSlug,
  networkNames,
} from "@repo/platform-contracts/network"
import * as Badge from "@repo/ui/badge"
import type { ReactElement } from "react"

/** "Test" / "Test · Mezo Testnet" for test environments; live ones need none. */
export default function EnvChip({
  kind,
  network,
  compact = false,
}: {
  kind: EnvironmentKind
  network: NetworkSlug
  /** Test environments drop the network name (connected-apps table). */
  compact?: boolean
}): ReactElement | null {
  if (kind === "live") return null
  return (
    <Badge.Root className="font-600">
      Test
      {compact ? null : ` · ${networkNames[network]}`}
    </Badge.Root>
  )
}
