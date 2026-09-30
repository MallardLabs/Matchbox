import type { LinkedDiscord } from "@repo/platform-contracts/identity"
import type { ReactElement } from "react"
import DiscordLinkHint from "./DiscordLinkHint"

/** Linked Discord identity (avatar, display name, username) or the hint. */
export default function DiscordSummary({
  discord,
}: {
  discord: LinkedDiscord | null
}): ReactElement {
  if (discord === null) return <DiscordLinkHint />
  return (
    <span className="inline-flex min-w-0 items-center justify-end gap-2">
      {discord.avatarUrl === null ? null : (
        <img
          src={discord.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="size-6 shrink-0 rounded-full bg-inset"
        />
      )}
      <span className="flex min-w-0 flex-col text-right">
        <span className="truncate font-600">
          {discord.displayName ?? discord.username ?? discord.id}
        </span>
        {discord.username === null ? null : (
          <span className="truncate font-mono text-[12px] font-400 text-secondary">
            @{discord.username}
          </span>
        )}
      </span>
    </span>
  )
}
