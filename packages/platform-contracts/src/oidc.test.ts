import { describe, expect, it } from "vitest"
import {
  authorizeRequestSchema,
  buildDiscoveryDocument,
  discoveryDocumentSchema,
  idTokenClaimsSchema,
  publicJwkFromSigningJwk,
  signingJwksSchema,
  tokenRequestSchema,
  tokenResponseSchema,
  userinfoResponseSchema,
} from "./oidc"
import { enabledOidcScopes } from "./scopes"

const clientId = `mbx_test_${"a".repeat(24)}`
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
const subject = `mbx_${"s".repeat(32)}`

describe("buildDiscoveryDocument", () => {
  it("builds a valid document from issuer and enabled scopes", () => {
    const document = buildDiscoveryDocument({
      issuer: "https://id.matchbox.markets/",
      scopes: enabledOidcScopes({ discordClaimsEnabled: false }),
    })
    expect(discoveryDocumentSchema.parse(document)).toEqual(document)
    expect(document.issuer).toBe("https://id.matchbox.markets")
    expect(document.token_endpoint).toBe(
      "https://id.matchbox.markets/oauth/token",
    )
    expect(document.jwks_uri).toBe("https://id.matchbox.markets/oauth/jwks")
    expect(document.scopes_supported).toEqual(["openid", "wallet"])
    expect(document.claims_supported).toContain("wallet_address")
    expect(document.claims_supported).not.toContain("discord_id")
    expect(document.code_challenge_methods_supported).toEqual(["S256"])
    expect(document.subject_types_supported).toEqual(["pairwise"])
  })

  it("adds discord claims when enabled", () => {
    const document = buildDiscoveryDocument({
      issuer: "http://localhost:8787",
      scopes: enabledOidcScopes({ discordClaimsEnabled: true }),
    })
    expect(document.scopes_supported).toContain("discord:profile")
    expect(document.claims_supported).toContain("discord_avatar_url")
  })
})

describe("authorizeRequestSchema", () => {
  const valid = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: "http://localhost:5173/cb",
    scope: "openid wallet",
    state: "xyz",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }

  it("accepts a PKCE S256 request", () => {
    expect(authorizeRequestSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects plain PKCE, missing state and implicit flow", () => {
    expect(
      authorizeRequestSchema.safeParse({
        ...valid,
        code_challenge_method: "plain",
      }).success,
    ).toBe(false)
    expect(
      authorizeRequestSchema.safeParse({ ...valid, state: undefined }).success,
    ).toBe(false)
    expect(
      authorizeRequestSchema.safeParse({ ...valid, response_type: "token" })
        .success,
    ).toBe(false)
  })
})

describe("tokenRequestSchema", () => {
  it("discriminates on grant_type", () => {
    const code = tokenRequestSchema.parse({
      grant_type: "authorization_code",
      code: "abc",
      redirect_uri: "https://a.example/cb",
      code_verifier: "v".repeat(43),
      client_id: clientId,
    })
    expect(code.grant_type).toBe("authorization_code")
    const refresh = tokenRequestSchema.parse({
      grant_type: "refresh_token",
      refresh_token: "r",
    })
    expect(refresh.grant_type).toBe("refresh_token")
    expect(
      tokenRequestSchema.safeParse({ grant_type: "client_credentials" })
        .success,
    ).toBe(false)
    expect(
      tokenRequestSchema.safeParse({
        grant_type: "authorization_code",
        code: "abc",
        redirect_uri: "https://a.example/cb",
        code_verifier: "short",
      }).success,
    ).toBe(false)
  })
})

describe("token and claim shapes", () => {
  it("validates token responses", () => {
    expect(
      tokenResponseSchema.safeParse({
        access_token: "a",
        token_type: "Bearer",
        expires_in: 600,
        refresh_token: "r",
        id_token: "i",
        scope: "openid",
      }).success,
    ).toBe(true)
  })

  it("validates userinfo and id token claims", () => {
    expect(
      userinfoResponseSchema.safeParse({
        sub: subject,
        wallet_address: `0x${"1".repeat(40)}`,
        wallet_network: "mezo",
        discord_display_name: null,
      }).success,
    ).toBe(true)
    expect(
      idTokenClaimsSchema.safeParse({
        iss: "https://id.matchbox.markets",
        aud: clientId,
        azp: clientId,
        sub: subject,
        iat: 1,
        exp: 601,
        auth_time: 1,
        nonce: "n",
      }).success,
    ).toBe(true)
  })
})

describe("signing keys", () => {
  it("parses the secret and derives public JWKs", () => {
    const keys = signingJwksSchema.parse([
      { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d", kid: "2026-09" },
    ])
    const [first] = keys
    expect(first).toBeDefined()
    if (first !== undefined) {
      expect(publicJwkFromSigningJwk(first)).toEqual({
        kty: "EC",
        crv: "P-256",
        x: "x",
        y: "y",
        kid: "2026-09",
        alg: "ES256",
        use: "sig",
      })
    }
    expect(signingJwksSchema.safeParse([]).success).toBe(false)
  })
})
