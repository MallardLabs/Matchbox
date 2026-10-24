import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider, readStoredPreference } from "./theme"
import { THEME_STORAGE_KEY, themeScript } from "./theme-script"
import * as ThemeToggle from "./theme-toggle"

function mockSystemDark(dark: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: dark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  document.documentElement.className = ""
})

describe("theme", () => {
  it("follows the system by default", () => {
    mockSystemDark(true)
    render(
      <ThemeProvider>
        <ThemeToggle.Root />
      </ThemeProvider>,
    )
    expect(document.documentElement).toHaveClass("dark")
    expect(
      screen.getByRole("button", { name: "System theme" }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("persists an override and clears it when back on system", async () => {
    mockSystemDark(false)
    render(
      <ThemeProvider>
        <ThemeToggle.Root />
      </ThemeProvider>,
    )
    expect(document.documentElement).not.toHaveClass("dark")
    await userEvent.click(screen.getByRole("button", { name: "Dark theme" }))
    expect(document.documentElement).toHaveClass("dark")
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")
    await userEvent.click(screen.getByRole("button", { name: "System theme" }))
    expect(document.documentElement).not.toHaveClass("dark")
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it("survives unavailable storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(readStoredPreference()).toBe("system")
  })

  it("inline script applies the stored override before React", () => {
    mockSystemDark(false)
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark")
    new Function(themeScript)()
    expect(document.documentElement).toHaveClass("dark")
    expect(document.documentElement.style.colorScheme).toBe("dark")
  })
})
