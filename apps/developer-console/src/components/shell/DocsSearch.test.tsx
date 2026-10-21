import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { describe, expect, it } from "vitest"
import { DocsSearchButton, DocsSearchProvider } from "./DocsSearch"

function renderSearch() {
  function Root(): ReactElement {
    return (
      <DocsSearchProvider>
        <DocsSearchButton />
        <Outlet />
      </DocsSearchProvider>
    )
  }
  const root = createRootRoute({ component: Root })
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <p>Home</p>,
  })
  const page = createRoute({
    getParentRoute: () => root,
    path: "/docs/$page",
    component: () => <p>Guide page</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, page]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

describe("docs search", () => {
  it("opens with Ctrl+K and goes to the first match on Enter", async () => {
    const user = userEvent.setup()
    const router = renderSearch()
    await screen.findByText("Home")
    await user.keyboard("{Control>}k{/Control}")
    const input = await screen.findByRole("searchbox", { name: "Search docs" })
    await user.type(input, "rate")
    expect(
      screen.getByRole("button", { name: /Rate limits/ }),
    ).toBeInTheDocument()
    await user.keyboard("{Enter}")
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/docs/rate-limits"),
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("moves through results with the arrow keys", async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByText("Home")
    const [trigger] = screen.getAllByRole("button", { name: /Search docs/ })
    if (trigger === undefined) throw new Error("No search trigger")
    await user.click(trigger)
    const input = await screen.findByRole("searchbox", { name: "Search docs" })
    await user.type(input, "{ArrowDown}")
    const results = screen
      .getAllByRole("button", { name: /./ })
      .filter((button) => button.hasAttribute("data-result"))
    expect(results[0]).toHaveFocus()
    await user.keyboard("{ArrowDown}")
    expect(results[1]).toHaveFocus()
    await user.keyboard("{ArrowUp}{ArrowUp}")
    expect(input).toHaveFocus()
  })
})
