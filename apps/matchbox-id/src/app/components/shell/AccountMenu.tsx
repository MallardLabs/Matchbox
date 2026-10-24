import * as DropdownMenu from "@repo/ui/dropdown-menu"
import { shortenAddress } from "@repo/ui/wallet-address"
import { useNavigate } from "@tanstack/react-router"
import { AppWindow, ChevronDown, LogOut, MonitorSmartphone } from "lucide-react"
import type { ReactElement } from "react"
import type { IdentityAccountView } from "../../../shared/contracts"
import { useSignOut } from "../../lib/queries"
import Identicon from "../Identicon"

/** Wallet chip in the header: connected apps, sessions, sign out. */
export default function AccountMenu({
  account,
}: {
  account: IdentityAccountView
}): ReactElement {
  const signOut = useSignOut()
  const navigate = useNavigate()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Account ${account.walletAddress}`}
        className="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-ink transition-colors hover:border-line-2 hover:bg-raised md:h-9"
      >
        <Identicon address={account.walletAddress} />
        <span className="font-mono text-label font-500">
          {shortenAddress(account.walletAddress)}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={13}
          strokeWidth={2}
          className="hidden text-secondary md:block"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item onSelect={() => void navigate({ to: "/" })}>
          <AppWindow aria-hidden="true" size={15} strokeWidth={1.75} />
          Connected apps
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() =>
            void navigate({ to: "/", search: { tab: "sessions" } })
          }
        >
          <MonitorSmartphone aria-hidden="true" size={15} strokeWidth={1.75} />
          Sessions
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          tone="danger"
          onSelect={() =>
            signOut.mutate(undefined, {
              onSuccess: () =>
                void navigate({ to: "/sign-in", search: { force: false } }),
            })
          }
        >
          <LogOut aria-hidden="true" size={15} strokeWidth={1.75} />
          Sign out
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}
