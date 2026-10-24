import type { App } from "@repo/platform-contracts/console"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { appMarkTone, initials } from "./AppMark"
import ChipGroup from "./ChipGroup"
import { ScopeChip } from "./Pill"
import StatStrip from "./StatStrip"
import { ReviewStatus } from "./Status"

describe("ChipGroup", () => {
  it("is a labelled group of pressed-state buttons", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ChipGroup
        label="Range"
        value="7d"
        onChange={onChange}
        options={[
          { value: "24h", label: "24 h", ariaLabel: "Last 24 hours" },
          { value: "7d", label: "7 d", ariaLabel: "Last 7 days" },
        ]}
      />,
    )
    expect(screen.getByRole("group", { name: "Range" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Last 7 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await user.click(screen.getByRole("button", { name: "Last 24 hours" }))
    expect(onChange).toHaveBeenCalledWith("24h")
  })
})

describe("status and chips", () => {
  it("labels review states in words, not colour alone", () => {
    render(<ReviewStatus state="submitted" />)
    expect(screen.getByText("In review")).toBeInTheDocument()
  })

  it("announces pending scopes", () => {
    render(<ScopeChip scope="discord:id" pending />)
    expect(screen.getByText("discord:id")).toHaveTextContent(
      "discord:id (pending review)",
    )
  })

  it("renders a strip as a description list", () => {
    render(
      <StatStrip
        aria-label="Totals"
        items={[{ key: "requests", label: "Requests", value: "126,412" }]}
      />,
    )
    const list = screen.getByLabelText("Totals")
    expect(list.tagName).toBe("DL")
    expect(list).toHaveTextContent("Requests126,412")
  })
})

describe("app marks", () => {
  const app = (overrides: Partial<App>): App => ({
    id: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000002",
    name: "Gauge Board",
    slug: "gauge-board",
    description: null,
    logoUrl: null,
    websiteUrl: null,
    privacyUrl: null,
    termsUrl: null,
    supportEmail: null,
    status: "active",
    environments: [],
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  })
  const environment = (
    kind: "test" | "live",
    reviewState: App["environments"][number]["reviewState"],
  ) => ({
    id: `00000000-0000-4000-8000-00000000000${kind === "test" ? 3 : 4}`,
    kind,
    network: kind === "test" ? ("mezo-testnet" as const) : ("mezo" as const),
    clientId: `mbx_${kind}_AbCdEfGhIjKlMnOpQrStUvWx`,
    reviewState,
    approvedScopes: [],
  })

  it("derives initials", () => {
    expect(initials("Stackbridge Rewards")).toBe("SR")
    expect(initials("Gaugeboard")).toBe("GA")
    expect(initials("  ")).toBe("?")
  })

  it("tones by state: retired, live approved, in review", () => {
    expect(appMarkTone(app({ status: "retired" }))).toBe("muted")
    expect(
      appMarkTone(app({ environments: [environment("live", "approved")] })),
    ).toBe("ink")
    expect(
      appMarkTone(app({ environments: [environment("live", "submitted")] })),
    ).toBe("accent")
    expect(
      appMarkTone(app({ environments: [environment("test", "development")] })),
    ).toBe("neutral")
  })
})
