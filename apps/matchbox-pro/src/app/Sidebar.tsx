import { useMarketTicker } from "@/hooks/useMarketTicker"
import * as AppShell from "@repo/ui/app-shell"
import { cn } from "@repo/ui/cn"
import { useTheme } from "@repo/ui/theme"
import * as ThemeToggle from "@repo/ui/theme-toggle"
import * as TokenMark from "@repo/ui/token-mark"
import { Link, useRouterState } from "@tanstack/react-router"
import { Moon, PanelLeft, Sun, Timer } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import XLogo from "./XLogo"
import { X_URL, isNavActive, moreNav, primaryNav } from "./nav"

type SidebarProps = {
  collapsed: boolean
  canToggle: boolean
  /** Tablet: the full sidebar opens over the page instead of beside it. */
  overlay?: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({
  collapsed,
  canToggle,
  overlay = false,
  onToggleCollapse,
}: SidebarProps): ReactElement {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { resolved } = useTheme()

  return (
    <AppShell.Sidebar
      collapsed={collapsed}
      className={
        overlay ? "fixed inset-y-0 left-0 z-overlay shadow-dialog" : undefined
      }
    >
      <AppShell.SidebarHeader>
        {collapsed ? (
          <>
            <Link to="/" aria-label="Matchbox home">
              <img
                src={`/matchbox-icon-${resolved}.png`}
                alt=""
                className="h-5 w-auto"
              />
            </Link>
            {canToggle ? (
              <CollapseButton
                label="Expand sidebar"
                expanded={false}
                onClick={onToggleCollapse}
              />
            ) : null}
          </>
        ) : (
          <>
            <Link to="/" aria-label="Matchbox home">
              <img
                src={`/matchbox-wordmark-${resolved}.png`}
                alt=""
                className="h-[25px] w-auto"
              />
            </Link>
            <CollapseButton
              label="Collapse sidebar"
              expanded
              onClick={onToggleCollapse}
            />
          </>
        )}
      </AppShell.SidebarHeader>

      <AppShell.SidebarNav>
        <AppShell.SidebarSection>
          {primaryNav.map((item) => (
            <AppShell.SidebarItem
              key={item.to}
              asChild
              label={item.label}
              active={isNavActive(item.to, pathname)}
              icon={<item.icon size={18} strokeWidth={1.75} />}
            >
              <Link to={item.to} />
            </AppShell.SidebarItem>
          ))}
        </AppShell.SidebarSection>
        <AppShell.SidebarSection label="More">
          {moreNav.map((item) =>
            item.kind === "internal" ? (
              <AppShell.SidebarItem
                key={item.to}
                asChild
                label={item.label}
                active={isNavActive(item.to, pathname)}
                icon={<item.icon size={18} strokeWidth={1.75} />}
              >
                <Link to={item.to} />
              </AppShell.SidebarItem>
            ) : (
              <AppShell.SidebarItem
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                label={item.label}
                icon={<item.icon size={18} strokeWidth={1.75} />}
              />
            ),
          )}
        </AppShell.SidebarSection>
      </AppShell.SidebarNav>

      <AppShell.SidebarFooter className="flex-col items-stretch gap-1.5">
        {collapsed ? null : <MarketTicker />}
        <div
          className={cn(
            "flex items-center gap-2",
            collapsed && "flex-col items-center",
          )}
        >
          {collapsed ? <RailThemeButton /> : <ThemeToggle.Root />}
          <a
            href={X_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Matchbox on X"
            className="flex size-9 items-center justify-center rounded-lg bg-inset-2 text-ink-2 transition-colors hover:text-ink"
          >
            <XLogo size={14} />
          </a>
        </div>
      </AppShell.SidebarFooter>
    </AppShell.Sidebar>
  )
}

function CollapseButton({
  label,
  expanded,
  onClick,
}: {
  label: string
  expanded: boolean
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-inset hover:text-ink"
    >
      <PanelLeft aria-hidden="true" size={16} strokeWidth={1.75} />
    </button>
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

function MarketTicker(): ReactElement {
  const ticker = useMarketTicker()
  return (
    <dl className="m-0 flex flex-col gap-2 px-1 pb-2.5 pt-1">
      <TickerRow
        icon={<TokenMark.Root kind="btc" size={16} />}
        label="BTC"
        value={ticker.btc}
      />
      <TickerRow
        icon={<TokenMark.Root kind="mezo" size={16} />}
        label="MEZO"
        value={ticker.mezo}
      />
      <TickerRow
        icon={
          <Timer
            aria-hidden="true"
            size={16}
            strokeWidth={1.75}
            className="text-secondary"
          />
        }
        label="Epoch"
        value={ticker.epoch}
      />
    </dl>
  )
}

function TickerRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <dt className="flex items-center gap-2 text-body-sm font-500 text-secondary">
        {icon}
        {label}
      </dt>
      <dd className="m-0 font-mono text-body-sm text-accent-ink">{value}</dd>
    </div>
  )
}
