export type ChangelogEntry = {
  date: string
  version: string
  title: string
  items: string[]
}

/** Newest first. Shown on Overview and in Docs › Changelog. */
export const changelog: ChangelogEntry[] = [
  {
    date: "2026-09-30",
    version: "2.0.0",
    title: "Developer platform v2",
    items: [
      "Passkey sign-in and email recovery",
      "Test (Mezo testnet) and live (Mezo) environments per app",
      "Publishable and secret API keys with rotation overlap",
      "Sign in with Matchbox: OIDC, PKCE S256, pairwise subjects",
      "Gauge Profile API v1 with cursor pagination and ETags",
      "Usage, request lookup and CSV export",
    ],
  },
]
