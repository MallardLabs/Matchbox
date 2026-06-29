import type { ReactNode } from "react"
import { IdentityBackdrop } from "./IdentityBackdrop"
import { MatchboxLogo } from "./MatchboxLogo"

export function IdentityShell({
  children,
}: { children: ReactNode }): JSX.Element {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-8">
      <IdentityBackdrop />
      <header className="relative z-10 mx-auto flex max-w-6xl justify-center sm:justify-start">
        <MatchboxLogo suffix="ID" href="/apps" />
      </header>
      <section className="relative z-10 mx-auto flex min-h-[calc(100dvh-5rem)] max-w-6xl items-center justify-center py-10">
        {children}
      </section>
    </main>
  )
}
