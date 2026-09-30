import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose"
import { beforeAll, describe, expect, it, vi } from "vitest"
import {
  OidcError,
  type OidcFetch,
  buildAuthorizeUrl,
  createPkcePair,
  exchangeCode,
  fetchUserinfo,
  pkceChallenge,
  refreshTokens,
  revokeToken,
  verifyIdToken,
} from "./oidc"

const issuer = "https://id.matchbox.markets"
const clientId = "mbx_test_AbCdEfGhIjKlMnOpQrStUvWx"
const subject = `mbx_${"s".repeat(32)}`

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function recordingFetch(response: Response) {
  const calls: Parameters<OidcFetch>[] = []
  const fetch = vi.fn<OidcFetch>(async (...args) => {
    calls.push(args)
    return response
  })
  return { fetch, calls }
}

const tokenBody = {
  access_token: "at",
  token_type: "Bearer",
  expires_in: 600,
  refresh_token: "rt",
  id_token: "idt",
  scope: "openid wallet",
}

describe("PKCE", () => {
  it("matches the RFC 7636 appendix B vector", async () => {
    expect(
      await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
  })

  it("creates a verifier/challenge pair", async () => {
    const pair = await createPkcePair()
    expect(pair.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(pair.codeChallengeMethod).toBe("S256")
    expect(await pkceChallenge(pair.codeVerifier)).toBe(pair.codeChallenge)
  })

  it("rejects short verifiers", async () => {
    await expect(pkceChallenge("short")).rejects.toThrow(TypeError)
  })
})

describe("buildAuthorizeUrl", () => {
  it("builds a code + PKCE request with openid always included", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId,
        redirectUri: "https://app.example.com/callback",
        scopes: ["wallet"],
        state: "state-1",
        nonce: "nonce-1",
        codeChallenge: "challenge",
        prompt: "consent",
      }),
    )
    expect(`${url.origin}${url.pathname}`).toBe(`${issuer}/oauth/authorize`)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: clientId,
      redirect_uri: "https://app.example.com/callback",
      scope: "openid wallet",
      state: "state-1",
      nonce: "nonce-1",
      code_challenge: "challenge",
      code_challenge_method: "S256",
      prompt: "consent",
    })
  })

  it("honours a custom issuer", () => {
    expect(
      buildAuthorizeUrl({
        issuer: "http://localhost:8787/",
        clientId,
        redirectUri: "http://localhost:3000/cb",
        scopes: [],
        state: "s",
        nonce: "n",
        codeChallenge: "c",
      }),
    ).toMatch(/^http:\/\/localhost:8787\/oauth\/authorize\?/)
  })
})

describe("token endpoint", () => {
  it("exchanges a code as a public client", async () => {
    const { fetch, calls } = recordingFetch(json(tokenBody))
    const tokens = await exchangeCode({
      clientId,
      code: "code-1",
      redirectUri: "https://app.example.com/callback",
      codeVerifier: "verifier",
      fetch,
    })
    expect(tokens).toEqual({
      accessToken: "at",
      tokenType: "Bearer",
      expiresIn: 600,
      idToken: "idt",
      refreshToken: "rt",
      scopes: ["openid", "wallet"],
    })
    const [url, init] = calls[0] ?? []
    expect(url).toBe(`${issuer}/oauth/token`)
    expect(init?.headers.Authorization).toBeUndefined()
    expect(Object.fromEntries(new URLSearchParams(init?.body))).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      redirect_uri: "https://app.example.com/callback",
      code_verifier: "verifier",
      client_id: clientId,
    })
  })

  it("uses client_secret_basic for confidential clients", async () => {
    const { fetch, calls } = recordingFetch(json(tokenBody))
    await refreshTokens({
      clientId,
      clientSecret: "s3cr:et",
      refreshToken: "rt",
      fetch,
    })
    const init = calls[0]?.[1]
    expect(init?.headers.Authorization).toBe(
      `Basic ${btoa(`${clientId}:s3cr%3Aet`)}`,
    )
    expect(new URLSearchParams(init?.body).get("client_id")).toBeNull()
    expect(new URLSearchParams(init?.body).get("grant_type")).toBe(
      "refresh_token",
    )
  })

  it("raises OAuth errors", async () => {
    const { fetch } = recordingFetch(
      json({ error: "invalid_grant", error_description: "Code expired" }, 400),
    )
    const error = await exchangeCode({
      clientId,
      code: "c",
      redirectUri: "https://app.example.com/callback",
      codeVerifier: "v",
      fetch,
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(OidcError)
    expect(error).toMatchObject({
      status: 400,
      error: "invalid_grant",
      errorDescription: "Code expired",
    })
  })

  it("revokes tokens", async () => {
    const { fetch, calls } = recordingFetch(new Response(null, { status: 200 }))
    await revokeToken({
      clientId,
      token: "rt",
      tokenTypeHint: "refresh_token",
      fetch,
    })
    expect(calls[0]?.[0]).toBe(`${issuer}/oauth/revoke`)
    expect(new URLSearchParams(calls[0]?.[1].body).get("token_type_hint")).toBe(
      "refresh_token",
    )
  })
})

describe("fetchUserinfo", () => {
  it("returns released claims only", async () => {
    const { fetch, calls } = recordingFetch(
      json({
        sub: subject,
        wallet_address: "0x3c6f9e2d5a8b1c4f7e0d3a6b9c2f5e8d1a4b7c0e",
        wallet_network: "mezo",
        discord_avatar_url: null,
        extra: "ignored",
      }),
    )
    const claims = await fetchUserinfo({ accessToken: "at", fetch })
    expect(claims).toEqual({
      sub: subject,
      wallet_address: "0x3c6f9e2d5a8b1c4f7e0d3a6b9c2f5e8d1a4b7c0e",
      wallet_network: "mezo",
      discord_avatar_url: null,
    })
    expect(calls[0]?.[1].headers.Authorization).toBe("Bearer at")
  })
})

describe("verifyIdToken", () => {
  let privateKey: CryptoKey
  let jwks: ReturnType<typeof createLocalJWKSet>
  let publicJwk: Record<string, unknown>

  beforeAll(async () => {
    const pair = await generateKeyPair("ES256", { extractable: true })
    privateKey = pair.privateKey
    publicJwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: "k1",
      alg: "ES256",
    }
    jwks = createLocalJWKSet({ keys: [publicJwk] })
  })

  function sign(
    claims: Record<string, unknown>,
    overrides: { issuer?: string; audience?: string } = {},
  ) {
    const now = Math.floor(Date.now() / 1000)
    return new SignJWT({
      nonce: "n-1",
      azp: clientId,
      auth_time: now,
      ...claims,
    })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setIssuer(overrides.issuer ?? issuer)
      .setAudience(overrides.audience ?? clientId)
      .setSubject(subject)
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(privateKey)
  }

  it("verifies a valid ES256 ID token", async () => {
    const token = await sign({ wallet_address: "0xabc" })
    const claims = await verifyIdToken(token, { clientId, nonce: "n-1", jwks })
    expect(claims).toMatchObject({
      sub: subject,
      iss: issuer,
      aud: clientId,
      nonce: "n-1",
      azp: clientId,
      wallet_address: "0xabc",
    })
  })

  it("rejects a nonce mismatch", async () => {
    const token = await sign({})
    await expect(
      verifyIdToken(token, { clientId, nonce: "other", jwks }),
    ).rejects.toThrow(/nonce/)
  })

  it("rejects the wrong audience and issuer", async () => {
    await expect(
      verifyIdToken(await sign({}, { audience: "mbx_test_other" }), {
        clientId,
        nonce: "n-1",
        jwks,
      }),
    ).rejects.toThrow()
    await expect(
      verifyIdToken(await sign({}, { issuer: "https://evil.example" }), {
        clientId,
        nonce: "n-1",
        jwks,
      }),
    ).rejects.toThrow()
  })

  it("fetches the issuer JWKS through a custom fetch", async () => {
    const { fetch, calls } = recordingFetch(json({ keys: [publicJwk] }))
    const token = await sign({})
    const claims = await verifyIdToken(token, { clientId, nonce: "n-1", fetch })
    expect(claims.sub).toBe(subject)
    expect(calls[0]?.[0]).toBe(`${issuer}/oauth/jwks`)
  })
})
