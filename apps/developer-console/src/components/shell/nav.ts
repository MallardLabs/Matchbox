import type { StaffRole } from "@repo/platform-contracts/console"
import {
  Activity,
  BookOpen,
  Box,
  Building2,
  LayoutGrid,
  type LucideIcon,
  ShieldCheck,
  UserRound,
} from "lucide-react"

export type NavTarget =
  | "/"
  | "/apps"
  | "/usage"
  | "/docs"
  | "/organization"
  | "/account"
  | "/admin"

export type NavItem = {
  to: NavTarget
  label: string
  icon: LucideIcon
  section: "primary" | "settings" | "staff"
  /** Shown in the mobile tab bar. */
  mobile: boolean
}

const baseItems: NavItem[] = [
  {
    to: "/",
    label: "Overview",
    icon: LayoutGrid,
    section: "primary",
    mobile: true,
  },
  { to: "/apps", label: "Apps", icon: Box, section: "primary", mobile: true },
  {
    to: "/usage",
    label: "Usage",
    icon: Activity,
    section: "primary",
    mobile: true,
  },
  {
    to: "/docs",
    label: "Docs",
    icon: BookOpen,
    section: "primary",
    mobile: true,
  },
  {
    to: "/organization",
    label: "Organization",
    icon: Building2,
    section: "settings",
    mobile: false,
  },
  {
    to: "/account",
    label: "Account",
    icon: UserRound,
    section: "settings",
    mobile: true,
  },
]

const adminItem: NavItem = {
  to: "/admin",
  label: "Admin",
  icon: ShieldCheck,
  section: "staff",
  mobile: false,
}

/** Sidebar destinations; Admin only for staff. */
export function navItems(staffRole: StaffRole | null): NavItem[] {
  return staffRole === null ? baseItems : [...baseItems, adminItem]
}

export function isNavActive(to: NavTarget, pathname: string): boolean {
  if (to === "/") return pathname === "/"
  return pathname === to || pathname.startsWith(`${to}/`)
}
