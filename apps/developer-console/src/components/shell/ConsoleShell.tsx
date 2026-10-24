import * as AppShell from "@repo/ui/app-shell"
import * as Logo from "@repo/ui/logo"
import { useTheme } from "@repo/ui/theme"
import * as ThemeToggle from "@repo/ui/theme-toggle"
import { Link, useRouterState } from "@tanstack/react-router"
import { Moon, Sun } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import { useOptionalSession } from "../../lib/session"
import { DESKTOP_QUERY, useMediaQuery } from "../../lib/use-media-query"
import AccountMenu from "./AccountMenu"
import { BreadcrumbSlot, BreadcrumbSlotProvider } from "./Breadcrumbs"
import { DocsSearchButton, DocsSearchProvider } from "./DocsSearch"
import OrgSwitcher from "./OrgSwitcher"
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
    <AppShell.SidebarNav className="mt-5">
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

function RailThemeButton(): ReactElement {
  const { resolved, setPreference } = useTheme()
  const next = resolved === "dark" ? "light" : "dark"
  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={`Switch to ${next} theme`}
      className="flex size-9 items-center justify-center rounded-lg bg-inset-2 text-ink-2 transition-colors hover:text-ink"
    >
      {resolved === "dark" ? (
        <Moon aria-hidden="true" size={16} strokeWidth={1.75} />
      ) : (
        <Sun aria-hidden="true" size={16} strokeWidth={1.75} />
      )}
    </button>
  )
}

/**
 * Sidebar (280px from 1280, icon rail from 768) + top bar + phone tab bar
 * around every signed-in page, and around Docs when signed out.
 */
export default function ConsoleShell({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const session = useOptionalSession()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const collapsed = !useMediaQuery(DESKTOP_QUERY)
  const items =
    session === null
      ? navItems(null).filter((item) => item.to === "/docs")
      : navItems(session.me.staffRole)

  return (
    <BreadcrumbSlotProvider>
      <DocsSearchProvider>
        <AppShell.Root className="overflow-x-clip">
          <AppShell.SkipLink />
          <AppShell.Sidebar collapsed={collapsed}>
            <AppShell.SidebarHeader
              className={
                collapsed ? undefined : "h-auto flex-col items-start gap-0.5"
              }
            >
              <Link to="/" aria-label="Matchbox Developer home">
                <Logo.Root variant={collapsed ? "icon" : "wordmark"} alt="" />
              </Link>
              {collapsed ? null : (
                <span className="pl-0.5 text-label font-500 text-muted">
                  Developer
                </span>
              )}
            </AppShell.SidebarHeader>
            <SidebarNavigation items={items} pathname={pathname} />
            <AppShell.SidebarFooter
              className={collapsed ? "gap-3" : "flex-col items-stretch gap-2.5"}
            >
              {session === null ? null : (
                <OrgSwitcher variant={collapsed ? "compact" : "sidebar"} />
              )}
              {collapsed ? (
                <RailThemeButton />
              ) : (
                <div className="flex items-center gap-2 border-t border-line pt-2.5">
                  <ThemeToggle.Root />
                  <span className="ml-auto text-caption font-500 text-faint">
                    Built by Trellium
                  </span>
                </div>
              )}
            </AppShell.SidebarFooter>
          </AppShell.Sidebar>
          <AppShell.Body>
            <AppShell.TopBar className="gap-3 md:gap-2.5 md:pl-8">
              <Link
                to="/"
                aria-label="Matchbox Developer home"
                className="shrink-0 md:hidden"
              >
                <Logo.Root variant="icon" alt="" className="h-4" />
              </Link>
              <BreadcrumbSlot />
              <span className="flex-1" />
              <DocsSearchButton />
              {session === null ? null : (
                <OrgSwitcher variant="compact" className="md:hidden" />
              )}
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
      </DocsSearchProvider>
    </BreadcrumbSlotProvider>
  )
}
