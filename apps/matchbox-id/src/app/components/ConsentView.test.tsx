import type {
  AuthorizationRequestView,
  ConsentScope,
  IdentityAccount,
} from "@repo/platform-contracts/identity"
import type { OidcScope } from "@repo/platform-contracts/scopes"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import ConsentView, { type ConsentDecision } from "./ConsentView"

const wallet = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"

const account: IdentityAccount = {
  walletAddress: wallet,
  signedInNetwork: "mezo",
  discord: {
    id: "100000000000000001",
    username: "matchbox-dev",
    displayName: "Matchbox Dev",
    avatarUrl: null,
  },
}

const openid: ConsentScope = {
  scope: "openid",
  label: "Sign-in ID",
  description: "A unique ID for this app",
  claims: [{ claim: "sub", label: "Sign-in ID", value: null }],
  available: true,
  unavailableReason: null,
  previouslyGranted: true,
  requirement: "required",
  previouslyDeclined: false,
}

const walletScope: ConsentScope = {
  scope: "wallet",
  label: "Wallet",
  description: "Wallet address and network",
  claims: [
    { claim: "wallet_address", label: "Wallet address", value: wallet },
    { claim: "wallet_network", label: "Wallet network", value: "mezo" },
  ],
  available: true,
  unavailableReason: null,
  previouslyGranted: false,
  requirement: "required",
  previouslyDeclined: false,
}

const discordId: ConsentScope = {
  scope: "discord:id",
  label: "Discord ID",
  description: "Linked Discord user ID",
  claims: [
    { claim: "discord_id", label: "Discord ID", value: "100000000000000001" },
  ],
  available: true,
  unavailableReason: null,
  previouslyGranted: false,
  requirement: "optional",
  previouslyDeclined: false,
}

const discordProfile: ConsentScope = {
  scope: "discord:profile",
  label: "Discord profile",
  description: "Discord username, display name and avatar",
  claims: [
    { claim: "discord_username", label: "Username", value: "matchbox-dev" },
    { claim: "discord_display_name", label: "Name", value: "Matchbox Dev" },
    { claim: "discord_avatar_url", label: "Avatar", value: null },
  ],
  available: true,
  unavailableReason: null,
  previouslyGranted: false,
  requirement: "optional",
  previouslyDeclined: true,
}

function request(
  overrides: Partial<AuthorizationRequestView> = {},
): AuthorizationRequestView {
  return {
    id: "3f1c5f6e-8a9b-4c2d-9e0f-1a2b3c4d5e6f",
    app: {
      name: "Gauge Scout",
      logoUrl: null,
      websiteUrl: "https://scout.example",
      privacyUrl: "https://scout.example/privacy",
      termsUrl: null,
      status: "active",
      verified: true,
    },
    environmentKind: "live",
    network: "mezo",
    redirectOrigin: "https://scout.example",
    redirectHost: "scout.example",
    scopes: [openid, walletScope],
    existingGrant: null,
    diff: { added: ["wallet"], removed: [], unchanged: ["openid"] },
    approvable: true,
    expiresAt: "2026-09-30T12:10:00.000Z",
    consentRequired: true,
    reauthenticationRequired: false,
    networkSignInRequired: false,
    ...overrides,
  }
}

function renderConsent(
  view: AuthorizationRequestView,
  onDecision: (
    decision: ConsentDecision,
    declinedScopes: OidcScope[],
  ) => void = () => {},
) {
  return render(
    <ConsentView
      request={view}
      account={account}
      pending={null}
      error={null}
      onDecision={onDecision}
      onSwitchAccount={() => {}}
    />,
  )
}

describe("ConsentView", () => {
  it("shows the app, the user's own values and the redirect host", async () => {
    const onDecision = vi.fn()
    renderConsent(request(), onDecision)

    expect(
      screen.getByRole("heading", { level: 1, name: /Gauge Scout/ }),
    ).toBeInTheDocument()
    expect(screen.getByText("Verified")).toBeInTheDocument()
    // Live apps carry no environment chip; test apps say so.
    expect(screen.queryByText(/Live|Test/)).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Privacy/ })).toHaveAttribute(
      "href",
      "https://scout.example/privacy",
    )
    expect(screen.getAllByText("scout.example").length).toBeGreaterThan(0)

    const scopes = within(screen.getByRole("region", { name: "Requested" }))
    expect(scopes.getByRole("heading", { name: "Wallet" })).toBeInTheDocument()
    expect(scopes.getAllByText("Required")).toHaveLength(2)
    expect(scopes.getByText("Unique to this app")).toBeInTheDocument()
    expect(scopes.getAllByText(wallet).length).toBeGreaterThan(0)
    expect(scopes.getByText("Mezo")).toBeInTheDocument()
    // Only the wallet scope is new; required scopes have no toggle.
    expect(scopes.getAllByText("New")).toHaveLength(1)
    expect(scopes.queryByRole("switch")).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Allow" }))
    expect(onDecision).toHaveBeenCalledWith("approve", [])
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onDecision).toHaveBeenCalledWith("deny", [])
  })

  it("lets the user switch optional scopes off and sends them as declined", async () => {
    const onDecision = vi.fn()
    renderConsent(
      request({ scopes: [openid, walletScope, discordId, discordProfile] }),
      onDecision,
    )
    const discordIdSwitch = screen.getByRole("switch", { name: "Discord ID" })
    const profileSwitch = screen.getByRole("switch", {
      name: "Discord profile",
    })
    // New optional scopes start on; a past "no" stays off.
    expect(discordIdSwitch).toBeChecked()
    expect(profileSwitch).not.toBeChecked()
    expect(screen.getAllByText("Optional")).toHaveLength(2)

    await userEvent.click(screen.getByRole("button", { name: "Allow" }))
    expect(onDecision).toHaveBeenLastCalledWith("approve", ["discord:profile"])

    // Keyboard: Space toggles the focused switch.
    discordIdSwitch.focus()
    await userEvent.keyboard(" ")
    expect(discordIdSwitch).not.toBeChecked()
    await userEvent.click(profileSwitch)
    expect(profileSwitch).toBeChecked()
    await userEvent.click(screen.getByRole("button", { name: "Allow" }))
    expect(onDecision).toHaveBeenLastCalledWith("approve", ["discord:id"])
  })

  it("keeps Allow for unavailable optional scopes and blocks it for required ones", () => {
    const unlinked: ConsentScope = {
      ...discordId,
      claims: [{ claim: "discord_id", label: "Discord ID", value: null }],
      available: false,
      unavailableReason: "discord-not-linked",
    }
    const { unmount } = renderConsent(
      request({
        environmentKind: "test",
        network: "mezo-testnet",
        app: { ...request().app, verified: false },
        scopes: [openid, unlinked],
      }),
    )
    expect(screen.getByText(/Test/)).toBeInTheDocument()
    expect(screen.queryByText("Verified")).not.toBeInTheDocument()
    expect(screen.getByText("Not linked")).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Discord ID" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Allow" })).toBeEnabled()
    unmount()

    renderConsent(
      request({
        approvable: false,
        scopes: [openid, { ...unlinked, requirement: "required" }],
      }),
    )
    expect(screen.getByText("Unavailable")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Allow" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled()
  })
})
