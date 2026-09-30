import * as AppShell from "@repo/ui/app-shell"
import * as Button from "@repo/ui/button"
import * as DropdownMenu from "@repo/ui/dropdown-menu"
import * as Logo from "@repo/ui/logo"
import * as ThemeToggle from "@repo/ui/theme-toggle"
import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { Building2, LogOut, UserRound } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import * as api from "../../lib/api"
import { useOptionalSession } from "../../lib/session"
import OrgSwitcher from "./OrgSwitcher"
import { TopBarSlotProvider, TopBarSlotTarget } from "./TopBarSlot"
import { type NavItem, isNavActive, navItems } from "./nav"

const sectionLabels: Record<NavItem["section"], string | undefined> = {
  primary: undefined,
  settings: "Settings",
  staff: "Staff",
}

export function SidebarNavigation({
  items,
  pathname,
}: {
  items: NavItem[]
  pathname: string
}): ReactElement {
  const sections: NavItem["section"][] = ["primary", "settings", "staff"]
  return (
    <AppShell.SidebarNav>
      {sections.map((section) => {
        const sectionItems = items.filter((item) => item.section === section)
        if (sectionItems.length === 0) return null
        const label = sectionLabels[section]
        return (
          <AppShell.SidebarSection
            key={section}
            {...(label === undefined ? {} : { label })}
          >
            {sectionItems.map((item) => (
              <AppShell.SidebarItem
                key={item.to}
                asChild
                active={isNavActive(item.to, pathname)}
                label={item.label}
                icon={<item.icon size={18} strokeWidth={1.75} />}
              >
                <Link to={item.to} />
              </AppShell.SidebarItem>
            ))}
          </AppShell.SidebarSection>
        )
      })}
    </AppShell.SidebarNav>
  )
}

function AccountMenu(): ReactElement {
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
  const { account } = session.me

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
        aria-label={`Account: ${account.displayName}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-inset-2 text-[13px] font-650 text-ink transition-colors hover:bg-inset"
      >
        {account.displayName.slice(0, 1).toUpperCase()}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="w-60">
        <DropdownMenu.Label className="normal-case tracking-normal">
          <span className="block truncate text-[13px] font-600 text-ink">
            {account.displayName}
          </span>
          <span className="block truncate text-[12px] font-500 text-secondary">
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
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={() => void signOut()}>
          <LogOut aria-hidden="true" size={15} strokeWidth={1.75} />
          Sign out
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}

/** Sidebar + top bar + mobile tab bar around every signed-in page. */
export default function ConsoleShell({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const session = useOptionalSession()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const items =
    session === null
      ? navItems(null).filter((item) => item.to === "/docs")
      : navItems(session.me.staffRole)

  return (
    <TopBarSlotProvider>
      <AppShell.Root>
        <AppShell.SkipLink />
        <AppShell.Sidebar>
          <AppShell.SidebarHeader>
            <Link to="/" aria-label="Matchbox Developers home">
              <Logo.Root alt="" />
            </Link>
            <span className="shrink-0 pl-3 text-[11px] font-650 uppercase tracking-[0.04em] text-secondary">
              Developers
            </span>
          </AppShell.SidebarHeader>
          {session === null ? null : <OrgSwitcher className="mt-6" />}
          <SidebarNavigation items={items} pathname={pathname} />
          <AppShell.SidebarFooter>
            <ThemeToggle.Root />
          </AppShell.SidebarFooter>
        </AppShell.Sidebar>
        <AppShell.Body>
          <AppShell.TopBar>
            <Link
              to="/"
              aria-label="Matchbox Developers home"
              className="md:hidden"
            >
              <Logo.Root variant="icon" alt="" />
            </Link>
            <TopBarSlotTarget />
            <span className="flex-1" />
            {session === null ? null : (
              <OrgSwitcher className="h-9 w-auto max-w-[160px] md:hidden" />
            )}
            <ThemeToggle.Root className="hidden sm:flex md:hidden" />
            <AccountMenu />
          </AppShell.TopBar>
          <AppShell.Main>{children}</AppShell.Main>
        </AppShell.Body>
        <AppShell.MobileNav>
          {items
            .filter((item) => item.mobile)
            .map((item) => (
              <AppShell.MobileNavItem
                key={item.to}
                asChild
                active={isNavActive(item.to, pathname)}
                label={item.label}
                icon={<item.icon size={20} strokeWidth={1.75} />}
              >
                <Link to={item.to} />
              </AppShell.MobileNavItem>
            ))}
        </AppShell.MobileNav>
      </AppShell.Root>
    </TopBarSlotProvider>
  )
}
