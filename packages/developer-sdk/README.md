# @matchbox-markets/sdk

TypeScript client for the [Matchbox API](https://developer.matchbox.markets)
and Sign in with Matchbox (OpenID Connect). ESM + CJS, typed from the
published OpenAPI document. No React or wallet dependencies; runs in
browsers, Cloudflare Workers, Deno, Bun and Node 18+ (OIDC helpers need
WebCrypto: Node 20+, or Node 18 with `--experimental-global-webcrypto`).

```sh
npm install @matchbox-markets/sdk
```

## Gauge profiles

```ts
import { createMatchboxClient, MatchboxApiError } from "@matchbox-markets/sdk"

const matchbox = createMatchboxClient({
  apiKey: process.env.MATCHBOX_API_KEY ?? "", // mbx_sk_live_… on servers
})

// One page
const page = await matchbox.gaugeProfiles.list({
  network: "mezo",
  profileType: "boost-gauge",
  limit: 50,
})

// Every profile, following cursors
for await (const profile of matchbox.gaugeProfiles.iterate({ network: "mezo" })) {
  if (profile.profileType === "validator-gauge") {
    console.log(profile.operatorAddress, profile.displayName)
  } else {
    console.log(profile.vebtcTokenId, profile.displayName)
  }
}

// Lookups
const { data, meta } = await matchbox.gaugeProfiles.get("mezo", "0x…")
const byToken = await matchbox.gaugeProfiles.byVebtc("mezo", 1042n)
const networks = await matchbox.networks.list()

try {
  await matchbox.gaugeProfiles.get("mezo", "0x0000000000000000000000000000000000000000")
} catch (error) {
  if (error instanceof MatchboxApiError) {
    console.error(error.status, error.code, error.requestId)
  }
}
```

- Test keys (`mbx_*_test_…`) read `mezo-testnet`; live keys read `mezo`.
- Publishable keys (`mbx_pk_…`) work in browsers from registered origins.
  Secret keys (`mbx_sk_…`) are server-only.
- 429 and 503 responses are retried up to `maxRetries` (default 2),
  honouring `Retry-After` up to `maxRetryDelayMs` (default 10 s).
- Options: `{ apiKey, baseUrl?, fetch?, maxRetries?, maxRetryDelayMs? }`.
  Every method accepts `{ signal }` for cancellation.

## Sign in with Matchbox

Authorization code flow with PKCE (S256), pairwise subjects and ES256 ID
tokens. Issuer `https://id.matchbox.markets`.

```ts
import {
  buildAuthorizeUrl,
  createNonce,
  createPkcePair,
  createState,
  exchangeCode,
  fetchUserinfo,
  refreshTokens,
  revokeToken,
  verifyIdToken,
} from "@matchbox-markets/sdk/oidc"

const clientId = "mbx_live_…"
const redirectUri = "https://app.example.com/auth/callback"

// 1. Start sign-in: keep state, nonce and codeVerifier server-side.
const pkce = await createPkcePair()
const state = createState()
const nonce = createNonce()
const url = buildAuthorizeUrl({
  clientId,
  redirectUri,
  scopes: ["openid", "wallet"],
  state,
  nonce,
  codeChallenge: pkce.codeChallenge,
})
// redirect the user to `url`

// 2. Callback: check `state`, then exchange the code.
const tokens = await exchangeCode({
  clientId,
  clientSecret: process.env.MATCHBOX_CLIENT_SECRET, // omit for public clients
  code,
  redirectUri,
  codeVerifier: pkce.codeVerifier,
})
const claims = await verifyIdToken(tokens.idToken ?? "", { clientId, nonce })
claims.sub // stable per app
claims.wallet_address // with the `wallet` scope

// 3. Later
const profile = await fetchUserinfo({ accessToken: tokens.accessToken })
const next = await refreshTokens({ clientId, refreshToken: tokens.refreshToken ?? "" })
await revokeToken({ clientId, token: next.refreshToken ?? "", tokenTypeHint: "refresh_token" })
```

OAuth failures throw `OidcError` (`status`, `error`, `errorDescription`).
Refresh tokens rotate: always store the newest one. Every helper accepts
`issuer` (local development) and `fetch`.

## Development

```sh
pnpm --filter @matchbox-markets/sdk generate  # regenerate src/generated/schema.ts
pnpm --filter @matchbox-markets/sdk test      # fails if the generated types are stale
pnpm --filter @matchbox-markets/sdk build
```
