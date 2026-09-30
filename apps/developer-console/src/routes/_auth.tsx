import * as Logo from "@repo/ui/logo"
import * as ThemeToggle from "@repo/ui/theme-toggle"
import { Link, Outlet, createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
})

function AuthLayout(): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="flex h-16 items-center justify-between px-4 md:px-8">
        <Link
          to="/"
          aria-label="Matchbox Developers home"
          className="flex items-center gap-3"
        >
          <Logo.Root alt="" />
          <span className="text-[11px] font-650 uppercase tracking-[0.04em] text-secondary">
            Developers
          </span>
        </Link>
        <ThemeToggle.Root />
      </header>
      <main
        id="main-content"
        className="flex flex-1 items-start justify-center px-4 pb-16 pt-[8vh]"
      >
        <div className="w-full max-w-[380px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
