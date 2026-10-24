import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Route as PrivacyRoute } from "../routes/privacy"

function renderPrivacy() {
  const component = PrivacyRoute.options.component
  if (component === undefined) throw new Error("privacy route has no component")
  const rootRoute = createRootRoute()
  const privacyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/privacy",
    component,
  })
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([privacyRoute, homeRoute]),
    history: createMemoryHistory({ initialEntries: ["/privacy"] }),
  })
  return render(<RouterProvider router={router} />)
}

describe("privacy page", () => {
  it("names the operator and contact without calling the API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    renderPrivacy()
    expect(
      await screen.findByRole("heading", { name: "Privacy policy" }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/operated by Trellium/, { exact: false }),
    ).toBeInTheDocument()
    for (const link of screen.getAllByRole("link", {
      name: "contact@trellium.org",
    })) {
      expect(link).toHaveAttribute("href", "mailto:contact@trellium.org")
    }
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
