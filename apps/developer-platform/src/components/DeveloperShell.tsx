import Link from "next/link"
import type { ReactNode } from "react"
import { MatchboxLogo } from "./MatchboxLogo"

export function DeveloperShell({
  children,
}: { children: ReactNode }): JSX.Element {
  return (
    <main className="min-h-dvh bg-stone-50 text-ink">
      <header className="border-b border-stone-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <MatchboxLogo suffix="Developers" href="/developers" />
          <nav
            aria-label="Developer navigation"
            className="flex items-center gap-5 text-sm font-medium"
          >
            <Link href="/developers">Apps</Link>
            <Link href="/docs">Documentation</Link>
            <a href="https://matchbox.markets">Matchbox</a>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
        {children}
      </div>
    </main>
  )
}
