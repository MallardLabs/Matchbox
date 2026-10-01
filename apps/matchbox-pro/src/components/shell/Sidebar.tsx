import TokenMark from "@/components/ui/TokenMark"
import XLogo from "@/components/ui/XLogo"
import { useMarketTicker } from "@/hooks/useMarketTicker"
import { cn } from "@/lib/cn"
import type { ThemeMode } from "@/lib/theme"
import { Link, useRouterState } from "@tanstack/react-router"
import {
  Activity,
  BookOpen,
  Gift,
  LayoutGrid,
  type LucideIcon,
  Moon,
  PanelLeft,
  Sparkles,
  Sun,
  Timer,
  Vote,
} from "lucide-react"
import type { ReactElement, ReactNode } from "react"

type SidebarProps = {
  collapsed: boolean
  /** False when the breakpoint forces the icon rail. */
  canToggle: boolean
  onToggleCollapse: () => void
  theme: ThemeMode
  onThemeChange: (mode: ThemeMode) => void
}

type NavItem = {
  to: "/" | "/vote" | "/rewards" | "/query" | "/activity"
  label: string
  icon: LucideIcon
}

const primaryNav: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutGrid },
  { to: "/vote", label: "Vote", icon: Vote },
  { to: "/rewards", label: "Rewards", icon: Gift },
]

const moreNav: NavItem[] = [
  { to: "/query", label: "Query", icon: Sparkles },
  { to: "/activity", label: "Activity", icon: Activity },
]

const DOCS_URL = "https://docs.matchbox.markets"
const X_URL = "https://x.com/matchboxmarkets"

export default function Sidebar({
  collapsed,
  canToggle,
  onToggleCollapse,
  theme,
  onThemeChange,
}: SidebarProps): ReactElement {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const ticker = useMarketTicker()
  const suffix = theme === "dark" ? "dark" : "light"

  function isActive(to: NavItem["to"]): boolean {
    return to === "/" ? pathname === "/" : pathname.startsWith(to)
  }

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 self-start md:flex flex-col border-r border-line bg-surface",
        collapsed
          ? "w-[72px] items-center px-3 pb-5 pt-6"
          : "w-[280px] px-[18px] pb-[22px] pt-7",
      )}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-3">
          <img
            src={`/matchbox-icon-${suffix}.png`}
            alt="Matchbox"
            className="h-5 w-auto"
          />
          {canToggle ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              className="flex size-9 items-center justify-center rounded-lg text-secondary hover:bg-inset hover:text-ink"
            >
              <PanelLeft size={16} strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex h-[25px] items-center justify-between">
          <Link to="/" aria-label="Matchbox home">
            <img
              src={`/matchbox-wordmark-${suffix}.png`}
              alt="Matchbox"
              className="h-[25px] w-auto"
            />
          </Link>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            className="flex size-8 items-center justify-center rounded-md text-faint hover:bg-inset hover:text-ink"
          >
            <PanelLeft size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}

      <nav
        aria-label="Primary"
        className={cn("flex w-full flex-col", collapsed ? "mt-6" : "mt-9")}
      >
        <ul className="flex flex-col gap-1">
          {primaryNav.map((item) => (
            <li key={item.to}>
              <NavLink
                item={item}
                active={isActive(item.to)}
                collapsed={collapsed}
              />
            </li>
          ))}
        </ul>
        {collapsed ? null : (
          <p className="px-3 pb-0.5 pt-[18px] text-[11px] font-650 uppercase tracking-[0.04em] text-muted">
            More
          </p>
        )}
        <ul className={cn("flex flex-col gap-[3px]", collapsed && "mt-4")}>
          {moreNav.map((item) => (
            <li key={item.to}>
              <NavLink
                item={item}
                active={isActive(item.to)}
                collapsed={collapsed}
              />
            </li>
          ))}
          <li>
            <NavRow
              collapsed={collapsed}
              label="Documentation"
              icon={BookOpen}
              active={false}
              render={(className, children) => (
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={className}
                >
                  {children}
                </a>
              )}
            />
          </li>
        </ul>
      </nav>

      <div className="flex-1" />

      {collapsed ? null : (
        <dl className="flex flex-col gap-2 px-1 pb-2.5 pt-3">
          <TickerRow
            label="BTC"
            value={ticker.btc}
            mark={<TokenMark kind="btc" />}
          />
          <TickerRow
            label="MEZO"
            value={ticker.mezo}
            mark={<TokenMark kind="mezo" />}
          />
          <TickerRow
            label="Epoch"
            value={ticker.epoch}
            mark={<Timer size={16} strokeWidth={1.75} className="text-muted" />}
          />
        </dl>
      )}

      <div
        className={cn(
          "flex items-center gap-2 pt-1.5",
          collapsed && "flex-col",
        )}
      >
        {collapsed ? (
          <button
            type="button"
            aria-label={
              theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
            onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
            className="flex size-9 items-center justify-center rounded-lg bg-inset-2 text-ink"
          >
            {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        ) : (
          <fieldset className="flex h-9 gap-0.5 rounded-lg bg-inset-2 p-[3px]">
            <legend className="sr-only">Theme</legend>
            <ThemeOption
              label="Light theme"
              active={theme === "light"}
              onClick={() => onThemeChange("light")}
            >
              <Sun size={16} strokeWidth={1.75} />
            </ThemeOption>
            <ThemeOption
              label="Dark theme"
              active={theme === "dark"}
              onClick={() => onThemeChange("dark")}
            >
              <Moon size={16} strokeWidth={1.75} />
            </ThemeOption>
          </fieldset>
        )}
        <a
          href={X_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Matchbox on X"
          className="flex size-9 items-center justify-center rounded-lg bg-inset-2 text-ink hover:text-accent-ink"
        >
          <XLogo />
        </a>
      </div>
    </aside>
  )
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
}): ReactElement {
  return (
    <NavRow
      collapsed={collapsed}
      label={item.label}
      icon={item.icon}
      active={active}
      render={(className, children) => (
        <Link
          to={item.to}
          aria-current={active ? "page" : undefined}
          className={className}
        >
          {children}
        </Link>
      )}
    />
  )
}

function NavRow({
  collapsed,
  label,
  icon: Icon,
  active,
  render,
}: {
  collapsed: boolean
  label: string
  icon: LucideIcon
  active: boolean
  render: (className: string, children: ReactNode) => ReactElement
}): ReactElement {
  const className = cn(
    "flex h-11 items-center rounded-lg text-[15px] transition-colors",
    collapsed ? "w-12 justify-center" : "gap-3 px-2.5",
    active
      ? "bg-inset font-600 text-ink"
      : "font-500 text-secondary hover:bg-inset hover:text-ink",
  )
  return render(
    className,
    <>
      {collapsed ? null : (
        <span
          aria-hidden="true"
          className={cn(
            "h-[18px] w-[3px] rounded-sm",
            active ? "bg-accent" : "bg-transparent",
          )}
        />
      )}
      <Icon
        size={18}
        strokeWidth={1.75}
        aria-hidden="true"
        className={active ? "text-accent" : undefined}
      />
      {collapsed ? <span className="sr-only">{label}</span> : label}
    </>,
  )
}

function ThemeOption({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}): ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-[30px] w-9 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-surface text-ink shadow-knob"
          : "text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  )
}

function TickerRow({
  label,
  value,
  mark,
}: {
  label: string
  value: string
  mark: ReactNode
}): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <dt className="flex items-center gap-2 text-[13px] font-500 text-secondary">
        {mark}
        {label}
      </dt>
      <dd className="font-mono text-[13px] font-500 text-accent-ink">
        {value}
      </dd>
    </div>
  )
}
