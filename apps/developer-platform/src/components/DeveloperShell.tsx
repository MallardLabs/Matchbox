import Link from "next/link"
import type { ReactNode } from "react"
import { MatchboxLogo } from "./MatchboxLogo"
import { ThemePicker } from "./ThemePicker"

export function DeveloperShell({
  children,
}: { children: ReactNode }): JSX.Element {
  return (
    <main className="min-h-dvh bg-stone-50 text-ink dark:bg-stone-950 dark:text-stone-100">
      <header className="border-b border-stone-200 bg-white px-4 py-4 dark:border-stone-800 dark:bg-stone-950 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <MatchboxLogo suffix="Developer Platform" href="/developers" />
          <div className="flex flex-wrap items-center gap-4">
            <nav
              aria-label="Developer navigation"
              className="flex items-center gap-5 text-sm font-medium text-stone-700 dark:text-stone-200"
            >
              <Link href="/developers">Apps</Link>
              <Link href="/docs">Documentation</Link>
              <a href="https://matchbox.markets">Matchbox</a>
            </nav>
            <ThemePicker />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
        {children}
      </div>
    </main>
  )
}
