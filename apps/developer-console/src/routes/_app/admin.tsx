import { cn } from "@repo/ui/cn"
import * as EmptyState from "@repo/ui/empty-state"
import {
  Link,
  Outlet,
  createFileRoute,
  useRouterState,
} from "@tanstack/react-router"
import type { ReactElement } from "react"
import { Crumb, Crumbs } from "../../components/shell/Breadcrumbs"
import PageTitle from "../../components/ui/PageTitle"
import { Pill } from "../../components/ui/Pill"
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
  const detail = pathname.startsWith("/admin/reviews/")
  const active =
    sections.find((section) =>
      section.to === "/admin"
        ? pathname === "/admin" || detail
        : pathname.startsWith(section.to),
    ) ?? sections[0]
  // Review detail renders its own header and breadcrumb.
  if (detail) return <Outlet />
  return (
    <div className="flex flex-col gap-6">
      <Crumbs>
        <Crumb>
          <Link to="/admin">Admin</Link>
        </Crumb>
        <Crumb current>{active.label}</Crumb>
      </Crumbs>
      <PageTitle
        eyebrow="Staff"
        title="Admin"
        actions={
          <Pill className="bg-inset text-ink">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />
            {humanize(me.staffRole)}
          </Pill>
        }
      />
      <nav aria-label="Admin sections">
        <ul className="m-0 flex min-w-0 list-none gap-6 overflow-x-auto overflow-y-hidden border-b border-line p-0">
          {sections.map((section) => {
            const current = section === active
            return (
              <li key={section.to} className="shrink-0">
                <Link
                  to={section.to}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "relative -mb-px inline-flex h-11 items-center whitespace-nowrap text-body-sm transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-sm",
                    current
                      ? "font-600 text-ink after:bg-accent"
                      : "font-500 text-secondary after:bg-transparent hover:text-ink",
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
