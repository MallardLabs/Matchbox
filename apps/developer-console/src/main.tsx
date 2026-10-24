import { ThemeProvider } from "@repo/ui/theme"
import * as Toast from "@repo/ui/toast"
import * as Tooltip from "@repo/ui/tooltip"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createQueryClient } from "./lib/queries"
import { StepUpProvider } from "./lib/step-up"
import { routeTree } from "./routeTree.gen"
import "./styles.css"

const queryClient = createQueryClient()

const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById("root")
if (root === null) throw new Error("Missing #root")

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Tooltip.Provider delayDuration={300}>
          <Toast.Provider viewportClassName="bottom-[76px] md:bottom-6">
            <StepUpProvider>
              <RouterProvider router={router} />
            </StepUpProvider>
          </Toast.Provider>
        </Tooltip.Provider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
