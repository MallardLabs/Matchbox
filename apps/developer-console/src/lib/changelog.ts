export type ChangelogEntry = {
  date: string
  version: string
  title: string
  items: string[]
}

/** Newest first. Shown on Overview and in Docs › Changelog. */
export const changelog: ChangelogEntry[] = [
  {
    date: "2026-10-26",
    version: "2.1.0",
    title: "Gauges, incentives and epochs",
    items: [
      "Every API key reads both mezo and mezo-testnet",
      "Gauges: /v1/gauges, per-gauge epoch history and veBTC lookup",
      "Incentives: /v1/incentives with USD values and APR per gauge",
      "Epochs: /v1/epochs/current",
      "SDK on npm as @matchbox-markets/sdk",
    ],
  },
  {
    date: "2026-09-30",
    version: "2.0.0",
    title: "Developer platform v2",
    items: [
      "Sign in with Google; staff domains are operators",
      "Test (Mezo testnet) and live (Mezo) environments per app",
      "Publishable and secret API keys with rotation overlap",
      "Sign in with Matchbox: OIDC, PKCE S256, pairwise subjects",
      "Gauge Profile API v1 with cursor pagination and ETags",
      "Usage, request lookup and CSV export",
    ],
  },
]
