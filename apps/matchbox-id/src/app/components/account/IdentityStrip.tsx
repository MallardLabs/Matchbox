import { networkNames } from "@repo/platform-contracts/network"
import * as Badge from "@repo/ui/badge"
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

/** Wallet, the network this session signed in on, and the linked Discord. */
export default function IdentityStrip({
  account,
}: {
  account: IdentityAccountView
}): ReactElement {
  const network = account.signedInNetwork
  const discord = account.discord
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-5 gap-y-3 border-y border-line py-3.5 md:grid-cols-3">
      <Item term="Wallet" className="col-span-2 md:col-span-1">
        <Identicon address={account.walletAddress} size={16} />
        <WalletAddress.Root
          address={account.walletAddress}
          className="[&>span:first-child]:text-body-sm [&>span:first-child]:text-ink"
        />
      </Item>
      <Item term="Signed in on" className="md:border-l md:border-line md:pl-5">
        {network === null ? (
          <span className="text-secondary">—</span>
        ) : (
          <>
            <span
              aria-hidden="true"
              className={cn(
                "size-[7px] shrink-0 rounded-full",
                network === "mezo" ? "bg-pos" : "bg-faint",
              )}
            />
            <span className="truncate font-600 text-ink">
              {networkNames[network]}
            </span>
          </>
        )}
        {account.signerKind === null ? null : (
          <Badge.Root mono>
            {account.signerKind === "eoa" ? "EOA" : "Contract"}
          </Badge.Root>
        )}
      </Item>
      <Item term="Discord" className="border-l border-line pl-5">
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
