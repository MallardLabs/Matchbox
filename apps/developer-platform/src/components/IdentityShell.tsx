import type { ReactNode } from "react"
import { IdentityBackdrop } from "./IdentityBackdrop"
import { MatchboxLogo } from "./MatchboxLogo"
import { ThemePicker } from "./ThemePicker"

export function IdentityShell({
  children,
}: { children: ReactNode }): JSX.Element {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-canvas px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 text-ink dark:bg-stone-950 dark:text-stone-100 sm:px-6 sm:pt-8">
      <IdentityBackdrop />
      <header className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <MatchboxLogo suffix="ID" href="/apps" />
        <ThemePicker />
      </header>
      <section className="relative z-10 mx-auto flex min-h-[calc(100dvh-5rem)] max-w-6xl items-center justify-center py-10">
        {children}
      </section>
    </main>
  )
}
