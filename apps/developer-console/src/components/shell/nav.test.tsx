import type { StaffRole } from "@repo/platform-contracts/console"
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { describe, expect, it } from "vitest"
import { SidebarNavigation } from "./ConsoleShell"
import { navItems } from "./nav"

function renderNav(staffRole: StaffRole | null): void {
  function Nav(): ReactElement {
    return <SidebarNavigation items={navItems(staffRole)} pathname="/apps" />
  }
  const router = createRouter({
    routeTree: createRootRoute({ component: Nav }),
    history: createMemoryHistory({ initialEntries: ["/apps"] }),
  })
  render(<RouterProvider router={router} />)
}

describe("admin navigation", () => {
  it("is hidden from developers without a staff role", async () => {
    renderNav(null)
    expect(
      await screen.findByRole("link", { name: "Apps" }),
    ).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull()
    expect(navItems(null).map((item) => item.to)).not.toContain("/admin")
  })

  it.each(["reviewer", "operator"] as const)(
    "is shown to %s staff",
    async (role) => {
      renderNav(role)
      expect(
        await screen.findByRole("link", { name: "Admin" }),
      ).toHaveAttribute("href", "/admin")
    },
  )

  it("marks the current section", async () => {
    renderNav(null)
    expect(await screen.findByRole("link", { name: "Apps" })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    )
  })
})
