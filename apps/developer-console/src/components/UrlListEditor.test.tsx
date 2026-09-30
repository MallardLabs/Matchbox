import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import UrlListEditor, { urlEntryError } from "./UrlListEditor"

describe("urlEntryError", () => {
  it("uses the contract validators per environment kind", () => {
    expect(
      urlEntryError("redirect-uri", "http://localhost:3000/cb", "test", []),
    ).toBeNull()
    expect(
      urlEntryError("redirect-uri", "http://localhost:3000/cb", "live", []),
    ).toMatchObject({
      message: "Use https (test also allows http://localhost)",
    })
    expect(
      urlEntryError("redirect-uri", "https://app.example.com/*", "live", []),
    ).toMatchObject({ message: "Wildcards are not allowed" })
    expect(
      urlEntryError("origin", "https://app.example.com/path", "live", []),
    ).toMatchObject({
      message: "Origins have no path",
      suggestion: "https://app.example.com",
    })
    expect(
      urlEntryError("redirect-uri", "https://a.example/cb", "live", [
        "https://a.example/cb",
      ]),
    ).toMatchObject({ message: "Already added" })
  })
})

describe("UrlListEditor", () => {
  it("shows validation messages inline and blocks invalid entries", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => {})
    render(
      <UrlListEditor
        mode="redirect-uri"
        kind="live"
        values={[]}
        onSave={onSave}
      />,
    )
    const input = screen.getByLabelText("New redirect URI")
    await user.type(input, "http://example.com/callback")
    await user.click(screen.getByRole("button", { name: "Add" }))
    expect(
      screen.getByText("Use https (test also allows http://localhost)"),
    ).toBeInTheDocument()
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
  })

  it("offers the canonical suggestion and saves the list", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_uris: string[]) => {})
    render(
      <UrlListEditor mode="origin" kind="test" values={[]} onSave={onSave} />,
    )
    const input = screen.getByLabelText("New origin")
    await user.type(input, "HTTPS://App.Example.com")
    await user.click(screen.getByRole("button", { name: "Add" }))
    expect(screen.getByText("Use the canonical form")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "https://app.example.com" }),
    )
    expect(input).toHaveValue("https://app.example.com")
    await user.click(screen.getByRole("button", { name: "Add" }))
    expect(screen.getByText("https://app.example.com")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(["https://app.example.com"]),
    )
  })
})
