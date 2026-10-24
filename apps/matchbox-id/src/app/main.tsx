import "./polyfills"
import { ThemeProvider } from "@repo/ui/theme"
import * as Toast from "@repo/ui/toast"
import * as Tooltip from "@repo/ui/tooltip"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { Component, type ReactNode, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { queryClient } from "./lib/query-client"
import { routeTree } from "./routeTree.gen"
import "./styles.css"

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
  { failed: boolean }
> {
  state: { failed: boolean } = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <p role="alert" className="m-6 text-[13px] text-neg">
          Matchbox ID failed to load
        </p>
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
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <Tooltip.Provider>
            <Toast.Provider>
              <RouterProvider router={router} />
            </Toast.Provider>
          </Tooltip.Provider>
        </QueryClientProvider>
      </ThemeProvider>
    </BootErrorBoundary>
  </StrictMode>,
)
