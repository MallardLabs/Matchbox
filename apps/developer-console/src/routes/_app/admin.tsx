import { cn } from "@repo/ui/cn"
import * as EmptyState from "@repo/ui/empty-state"
import * as PageHeader from "@repo/ui/page-header"
import {
  Link,
  Outlet,
  createFileRoute,
  useRouterState,
} from "@tanstack/react-router"
import type { ReactElement } from "react"
import { humanize } from "../../lib/format"
import { useSession } from "../../lib/session"
import { useTitle } from "../../lib/title"

export const Route = createFileRoute("/_app/admin")({
  component: AdminLayout,
})

const sections = [
  { to: "/admin", label: "Reviews" },
  { to: "/admin/apps", label: "Apps" },
  { to: "/admin/quotas", label: "Quotas" },
  { to: "/admin/audit", label: "Audit log" },
] as const

function AdminLayout(): ReactElement {
  const { me } = useSession()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  useTitle("Admin")
  if (me.staffRole === null) {
    return (
      <EmptyState.Root layout="centered">
        <EmptyState.Title>Not found</EmptyState.Title>
      </EmptyState.Root>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader.Root>
        <PageHeader.Heading>
          <PageHeader.Eyebrow>{`Staff · ${humanize(me.staffRole)}`}</PageHeader.Eyebrow>
          <PageHeader.Title>Admin</PageHeader.Title>
        </PageHeader.Heading>
      </PageHeader.Root>
      <nav aria-label="Admin sections" className="-mt-2">
        <ul className="m-0 flex min-w-0 list-none gap-5 overflow-x-auto overflow-y-hidden border-b border-line p-0">
          {sections.map((section) => {
            const active =
              section.to === "/admin"
                ? pathname === "/admin" || pathname.startsWith("/admin/reviews")
                : pathname.startsWith(section.to)
            return (
              <li key={section.to}>
                <Link
                  to={section.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative -mb-px inline-flex h-10 items-center whitespace-nowrap text-[13px] transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-sm",
                    active
                      ? "font-600 text-ink after:bg-accent"
                      : "font-550 text-secondary after:bg-transparent hover:text-ink",
                  )}
                >
                  {section.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <Outlet />
    </div>
  )
}
