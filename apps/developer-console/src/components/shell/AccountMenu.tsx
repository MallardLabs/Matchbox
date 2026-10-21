import * as Button from "@repo/ui/button"
import * as DropdownMenu from "@repo/ui/dropdown-menu"
import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  Building2,
  ChevronDown,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import type { ReactElement } from "react"
import * as api from "../../lib/api"
import { useOptionalSession } from "../../lib/session"
import { initials } from "../ui/AppMark"

/** Top bar account chip: initials, email (wide screens), menu. */
export default function AccountMenu(): ReactElement {
  const session = useOptionalSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  if (session === null) {
    return (
      <Button.Root asChild>
        <Link to="/sign-in">Sign in</Link>
      </Button.Root>
    )
  }
  const { account, staffRole } = session.me

  async function signOut(): Promise<void> {
    try {
      await api.auth.signOut()
    } finally {
      queryClient.clear()
      await navigate({ to: "/sign-in" })
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Account: ${account.email}`}
        className="flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-inset md:border md:border-line md:pr-2.5 md:hover:border-line-2 md:hover:bg-surface"
      >
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-inset text-caption font-700 text-ink-2"
        >
          {initials(account.displayName)}
        </span>
        <span className="hidden max-w-[220px] truncate text-body-sm text-ink xl:block">
          {account.email}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={14}
          strokeWidth={1.75}
          className="hidden shrink-0 text-muted md:block"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="w-60">
        <DropdownMenu.Label className="normal-case tracking-normal">
          <span className="block truncate text-body-sm font-600 text-ink">
            {account.displayName}
          </span>
          <span className="block truncate text-label font-500 text-secondary">
            {account.email}
          </span>
        </DropdownMenu.Label>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={() => void navigate({ to: "/account" })}>
          <UserRound aria-hidden="true" size={15} strokeWidth={1.75} />
          Account
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() => void navigate({ to: "/organization" })}
        >
          <Building2 aria-hidden="true" size={15} strokeWidth={1.75} />
          Organization
        </DropdownMenu.Item>
        {staffRole === null ? null : (
          <DropdownMenu.Item onSelect={() => void navigate({ to: "/admin" })}>
            <ShieldCheck aria-hidden="true" size={15} strokeWidth={1.75} />
            Admin
          </DropdownMenu.Item>
        )}
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={() => void signOut()}>
          <LogOut aria-hidden="true" size={15} strokeWidth={1.75} />
          Sign out
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}
