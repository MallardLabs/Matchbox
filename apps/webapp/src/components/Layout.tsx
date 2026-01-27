import type { ReactNode } from "react"
import { Header } from "./Header"
import { Footer } from "./Footer"

type LayoutProps = {
  children: ReactNode
}

export function Layout({ children }: LayoutProps): JSX.Element {
  return (
    <div className="relative z-10 flex min-h-screen flex-col bg-transparent">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-8">
        {children}
      </main>
      <Footer />
    </div>
  )
}
