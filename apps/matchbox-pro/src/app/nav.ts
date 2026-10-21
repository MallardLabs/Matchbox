import {
  Activity,
  BookOpen,
  Gift,
  LayoutGrid,
  type LucideIcon,
  Vote,
} from "lucide-react"

export const DOCS_URL = "https://docs.matchbox.markets"
export const X_URL = "https://x.com/matchboxmarkets"

export type InternalNavItem = {
  kind: "internal"
  to: "/" | "/vote" | "/rewards" | "/activity"
  label: string
  icon: LucideIcon
}

export type ExternalNavItem = {
  kind: "external"
  href: string
  label: string
  icon: LucideIcon
}

export type NavItem = InternalNavItem | ExternalNavItem

export const primaryNav: InternalNavItem[] = [
  { kind: "internal", to: "/", label: "Overview", icon: LayoutGrid },
  { kind: "internal", to: "/vote", label: "Vote", icon: Vote },
  { kind: "internal", to: "/rewards", label: "Rewards", icon: Gift },
]

export const moreNav: NavItem[] = [
  { kind: "internal", to: "/activity", label: "Activity", icon: Activity },
  { kind: "external", href: DOCS_URL, label: "Documentation", icon: BookOpen },
]

export function isNavActive(to: InternalNavItem["to"], pathname: string) {
  if (to === "/") return pathname === "/"
  if (to === "/vote") {
    return pathname.startsWith("/vote") || pathname.startsWith("/gauges")
  }
  return pathname.startsWith(to)
}

/** Title shown in the mobile top bar for the current route. */
export function pageTitle(pathname: string): string {
  if (pathname === "/") return "Overview"
  if (pathname.startsWith("/vote") || pathname.startsWith("/gauges")) {
    return "Vote"
  }
  if (pathname.startsWith("/rewards")) return "Rewards"
  if (pathname.startsWith("/activity")) return "Activity"
  if (pathname.startsWith("/query")) return "Query"
  return "Matchbox"
}
