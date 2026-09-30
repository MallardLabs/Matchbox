import type {
  AuthorizationRequestView,
  IdentityAccount,
} from "@repo/platform-contracts/identity"
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
    scopes: [
      {
        scope: "openid",
        label: "Sign-in ID",
        description: "A unique ID for this app",
        claims: [{ claim: "sub", label: "Sign-in ID", value: null }],
        available: true,
        unavailableReason: null,
        previouslyGranted: true,
      },
      {
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
      },
    ],
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
  onDecision: (decision: ConsentDecision) => void = () => {},
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
    expect(screen.queryByText("Test")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Privacy/ })).toHaveAttribute(
      "href",
      "https://scout.example/privacy",
    )
    expect(screen.getByText("scout.example")).toBeInTheDocument()

    const scopes = within(screen.getByRole("region", { name: "Requested" }))
    expect(scopes.getByText("Wallet")).toBeInTheDocument()
    expect(screen.getAllByText(wallet).length).toBeGreaterThan(0)
    expect(screen.getByText("Mezo")).toBeInTheDocument()
    expect(screen.getByText("Granted")).toBeInTheDocument()
    expect(screen.getByText("New")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Allow" }))
    expect(onDecision).toHaveBeenCalledWith("approve")
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onDecision).toHaveBeenCalledWith("deny")
  })

  it("marks test apps and blocks Allow when Discord is not linked", () => {
    renderConsent(
      request({
        environmentKind: "test",
        network: "mezo-testnet",
        app: {
          ...request().app,
          verified: false,
        },
        approvable: false,
        scopes: [
          {
            scope: "discord:id",
            label: "Discord ID",
            description: "Linked Discord user ID",
            claims: [{ claim: "discord_id", label: "Discord ID", value: null }],
            available: false,
            unavailableReason: "discord-not-linked",
            previouslyGranted: false,
          },
        ],
      }),
    )
    expect(screen.getByText("Test")).toBeInTheDocument()
    expect(screen.queryByText("Verified")).not.toBeInTheDocument()
    expect(screen.getByText("Not linked")).toBeInTheDocument()
    expect(screen.getByText("/link")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Allow" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled()
  })
})
