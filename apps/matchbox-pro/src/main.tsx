import "./polyfills"
import WalletProviders from "@/components/wallet/Providers"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { Component, type ReactNode, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { routeTree } from "./routeTree.gen"
import "@fontsource-variable/figtree"
import "@fontsource/dm-mono/400.css"
import "@fontsource/dm-mono/500.css"
import "./styles/globals.css"

const router = createRouter({
  routeTree,
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

class BootErrorBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  state: { message: string | null } = { message: null }

  static getDerivedStateFromError(error: unknown): { message: string } {
    return {
      message: error instanceof Error ? error.message : "Failed to start",
    }
  }

  render(): ReactNode {
    if (this.state.message) {
      return (
        <pre className="m-6 whitespace-pre-wrap text-[13px] text-neg">
          {this.state.message}
        </pre>
      )
    }
    return this.props.children
  }
}

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root")

createRoot(root).render(
  <StrictMode>
    <BootErrorBoundary>
      <WalletProviders>
        <RouterProvider router={router} />
      </WalletProviders>
    </BootErrorBoundary>
  </StrictMode>,
)
