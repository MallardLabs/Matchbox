import { cn } from "@repo/ui/cn"
import * as WalletAddress from "@repo/ui/wallet-address"
import type { ReactElement, ReactNode } from "react"
import type { IdentityAccountView } from "../../../shared/contracts"
import DiscordLinkHint from "../DiscordLinkHint"
import Identicon from "../Identicon"

function Item({
  term,
  className,
  children,
}: {
  term: string
  className?: string
  children: ReactNode
}): ReactElement {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <dt className="text-caption text-secondary">{term}</dt>
      <dd className="m-0 flex h-7 min-w-0 items-center gap-2 text-body-sm">
        {children}
      </dd>
    </div>
  )
}

/** The signed-in wallet and its linked Discord. */
export default function IdentityStrip({
  account,
}: {
  account: IdentityAccountView
}): ReactElement {
  const discord = account.discord
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-5 gap-y-3 border-y border-line py-3.5 sm:grid-cols-2">
      <Item term="Wallet">
        <Identicon address={account.walletAddress} size={16} />
        <WalletAddress.Root
          address={account.walletAddress}
          className="[&>span:first-child]:text-body-sm [&>span:first-child]:text-ink"
        />
      </Item>
      <Item term="Discord" className="sm:border-l sm:border-line sm:pl-5">
        {discord === null ? (
          <DiscordLinkHint />
        ) : (
          <>
            {discord.avatarUrl === null ? null : (
              <img
                src={discord.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-[18px] shrink-0 rounded-full bg-inset-2"
              />
            )}
            <span className="truncate font-600 text-ink">
              {discord.username ?? discord.displayName ?? discord.id}
            </span>
            <span className="text-label text-pos">linked</span>
          </>
        )}
      </Item>
    </dl>
  )
}
