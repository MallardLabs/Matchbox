import * as Logo from "@repo/ui/logo"
import { useQuery } from "@tanstack/react-query"
import { Link, Outlet, createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { StatusDot } from "../components/ui/Status"
import { healthLabels, healthTones, productHealth } from "../lib/health"
import { healthQuery } from "../lib/queries"

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
})

const proUrl = "https://pro.matchbox.markets"

function ApiStatus(): ReactElement {
  const health = useQuery(healthQuery)
  const api = productHealth(health.data, "gauge-profile-api")
  const status = api?.status ?? "unknown"
  return (
    <p className="flex items-center gap-2 text-label text-secondary">
      <StatusDot tone={healthTones[status]} />
      {`API · ${status === "unknown" ? "—" : healthLabels[status].toLowerCase()}`}
    </p>
  )
}

/** Sign-in and invitations (C01, C01m). */
function AuthLayout(): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas bg-[radial-gradient(ellipse_90%_45%_at_50%_0%,color-mix(in_srgb,var(--accent)_11%,transparent),transparent_75%)] text-ink">
      <header className="flex h-16 items-center px-5 md:h-[88px] md:px-12">
        <Link
          to="/"
          aria-label="Matchbox Developers home"
          className="flex items-center gap-3"
        >
          <Logo.Root alt="" className="h-[18px] md:h-[25px]" />
          <span className="text-body-sm font-500 text-secondary">
            Developers
          </span>
        </Link>
      </header>
      <main
        id="main-content"
        className="flex flex-1 items-start justify-center px-5 pb-16 pt-[8vh] md:items-center md:pt-0"
      >
        <div className="w-full max-w-[400px] md:max-w-[440px]">
          <Outlet />
        </div>
      </main>
      <footer className="flex items-center gap-5 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 md:px-12 md:pb-7">
        <ApiStatus />
        <span className="flex-1" />
        <nav aria-label="Links" className="hidden items-center gap-4 md:flex">
          <Link to="/docs" className="text-label text-secondary hover:text-ink">
            Docs
          </Link>
          <a href={proUrl} className="text-label text-secondary hover:text-ink">
            Matchbox Pro
          </a>
        </nav>
        <span className="text-caption font-500 text-faint">
          Built by Trellium
        </span>
      </footer>
    </div>
  )
}
