import * as Badge from "@repo/ui/badge"
import type { ReactElement } from "react"

/** "Not linked" plus the Discord bot command that links a wallet. */
export default function DiscordLinkHint(): ReactElement {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-secondary">Not linked</span>
      <Badge.Root mono aria-label="Link with the /link command in Discord">
        /link
      </Badge.Root>
    </span>
  )
}
