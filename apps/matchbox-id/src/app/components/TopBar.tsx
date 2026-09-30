import type { IdentityAccount } from "@repo/platform-contracts/identity"
import * as AppShell from "@repo/ui/app-shell"
import * as Button from "@repo/ui/button"
import * as DropdownMenu from "@repo/ui/dropdown-menu"
import * as Logo from "@repo/ui/logo"
import * as ThemeToggle from "@repo/ui/theme-toggle"
import { shortenAddress } from "@repo/ui/wallet-address"
import { Link, useNavigate } from "@tanstack/react-router"
import { ChevronDown } from "lucide-react"
import type { ReactElement } from "react"
import { useSignOut } from "../lib/queries"

function AccountMenu({ account }: { account: IdentityAccount }): ReactElement {
  const signOut = useSignOut()
  const navigate = useNavigate()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button.Root variant="secondary" size="md" aria-label="Account menu">
          <span className="font-mono text-[12px] font-500">
            {shortenAddress(account.walletAddress)}
          </span>
          <ChevronDown aria-hidden="true" size={13} strokeWidth={2} />
        </Button.Root>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        <DropdownMenu.Item onSelect={() => void navigate({ to: "/" })}>
          Account
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => void navigate({ to: "/apps" })}>
          Connected apps
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
          Sign out
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}

export default function TopBar({
  account,
}: {
  account: IdentityAccount | null
}): ReactElement {
  return (
    <AppShell.TopBar className="justify-between">
      <Link
        to="/"
        className="flex items-center gap-2 rounded-md"
        aria-label="Matchbox ID"
      >
        <Logo.Root variant="icon" alt="" className="sm:hidden" />
        <Logo.Root
          variant="wordmark"
          alt=""
          className="hidden sm:inline-flex"
        />
        <span className="rounded-[5px] bg-inset px-1.5 py-0.5 text-[11px] font-650 uppercase tracking-[0.04em] text-secondary">
          ID
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle.Root
          className={account === null ? "" : "hidden min-[400px]:flex"}
        />
        {account === null ? null : <AccountMenu account={account} />}
      </div>
    </AppShell.TopBar>
  )
}
