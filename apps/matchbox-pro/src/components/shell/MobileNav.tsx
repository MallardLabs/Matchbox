import { cn } from "@/lib/cn"
import { Link, useRouterState } from "@tanstack/react-router"
import {
  Activity,
  BookOpen,
  Gift,
  LayoutGrid,
  type LucideIcon,
  Menu,
  Sparkles,
  Vote,
} from "lucide-react"
import { type ReactElement, useState } from "react"

type Tab = {
  to: "/" | "/vote" | "/rewards"
  label: string
  icon: LucideIcon
}

const tabs: Tab[] = [
  { to: "/", label: "Overview", icon: LayoutGrid },
  { to: "/vote", label: "Vote", icon: Vote },
  { to: "/rewards", label: "Rewards", icon: Gift },
]

const DOCS_URL = "https://docs.matchbox.markets"

/** Bottom tab bar for <768px (Pen C/Mobile nav). */
export default function MobileNav(): ReactElement {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive =
    pathname.startsWith("/query") || pathname.startsWith("/activity")

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {moreOpen ? (
        <ul className="absolute bottom-full right-3 mb-2 w-44 rounded-lg border border-line bg-surface p-1 shadow-pop">
          <MoreLink
            to="/query"
            label="Query"
            icon={Sparkles}
            onDone={() => setMoreOpen(false)}
          />
          <MoreLink
            to="/activity"
            label="Activity"
            icon={Activity}
            onDone={() => setMoreOpen(false)}
          />
          <li>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center gap-3 rounded-md px-3 text-[14px] font-500 text-ink hover:bg-inset"
            >
              <BookOpen
                size={16}
                strokeWidth={1.75}
                className="text-secondary"
              />
              Documentation
            </a>
          </li>
        </ul>
      ) : null}
      <ul className="grid h-[60px] grid-cols-4">
        {tabs.map((tab) => {
          const active =
            tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to)
          return (
            <li key={tab.to}>
              <Link
                to={tab.to}
                aria-current={active ? "page" : undefined}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px]",
                  active ? "font-600 text-ink" : "font-500 text-muted",
                )}
              >
                <tab.icon
                  size={20}
                  strokeWidth={1.75}
                  className={active ? "text-accent" : undefined}
                  aria-hidden="true"
                />
                {tab.label}
              </Link>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
            className={cn(
              "flex h-full w-full flex-col items-center justify-center gap-1 text-[11px]",
              moreActive || moreOpen
                ? "font-600 text-ink"
                : "font-500 text-muted",
            )}
          >
            <Menu
              size={20}
              strokeWidth={1.75}
              className={moreActive ? "text-accent" : undefined}
              aria-hidden="true"
            />
            More
          </button>
        </li>
      </ul>
    </nav>
  )
}

function MoreLink({
  to,
  label,
  icon: Icon,
  onDone,
}: {
  to: "/query" | "/activity"
  label: string
  icon: LucideIcon
  onDone: () => void
}): ReactElement {
  return (
    <li>
      <Link
        to={to}
        onClick={onDone}
        className="flex h-11 items-center gap-3 rounded-md px-3 text-[14px] font-500 text-ink hover:bg-inset"
      >
        <Icon size={16} strokeWidth={1.75} className="text-secondary" />
        {label}
      </Link>
    </li>
  )
}
