import type { EnvironmentKind } from "@repo/platform-contracts/network"
import * as Badge from "@repo/ui/badge"
import type { ReactElement } from "react"

/** Only test environments are marked; live is the default. */
export default function EnvironmentBadge({
  kind,
}: {
  kind: EnvironmentKind
}): ReactElement | null {
  if (kind !== "test") return null
  return (
    <Badge.Root tone="warn" dot>
      Test
    </Badge.Root>
  )
}
