import {
  type JWTPayload,
  type JWTVerifyGetKey,
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
} from "jose"
import { isRecord } from "./errors"

/**
 * Sign in with Matchbox (OpenID Connect, authorization code + PKCE S256).
 * Runtime-neutral: needs global `fetch` and WebCrypto (`crypto.subtle`) —
 * browsers, Workers, Deno, Bun and Node 20+ (Node 18: run with
 * `--experimental-global-webcrypto`).
 */

export const defaultIssuer = "https://id.matchbox.markets"

export type OidcScope = "openid" | "wallet" | "discord:id" | "discord:profile"

export type OidcFetch = (
  input: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<Response>

export type OidcEndpoints = {
  issuer: string
  authorization: string
  token: string
  userinfo: string
  revocation: string
  jwks: string
}

export function oidcEndpoints(issuer: string = defaultIssuer): OidcEndpoints {
  const base = issuer.replace(/\/+$/, "")
  return {
    issuer: base,
    authorization: `${base}/oauth/authorize`,
    token: `${base}/oauth/token`,
    userinfo: `${base}/oauth/userinfo`,
    revocation: `${base}/oauth/revoke`,
    jwks: `${base}/oauth/jwks`,
  }
}

function webCrypto(): Crypto {
  const candidate: unknown = globalThis.crypto
  if (
    !isRecord(candidate) ||
    typeof candidate.getRandomValues !== "function" ||
    !isRecord(candidate.subtle)
  ) {
    throw new Error(
      "WebCrypto is unavailable. Use Node 20+ or enable globalThis.crypto.",
    )
  }
  return globalThis.crypto
}

function base64Encode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64UrlEncode(bytes: Uint8Array): string {
  return base64Encode(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

/** `bytes` of randomness as unpadded base64url (default 32 → 43 chars). */
export function randomUrlSafe(bytes = 32): string {
  return base64UrlEncode(webCrypto().getRandomValues(new Uint8Array(bytes)))
}

/** CSRF `state` for the authorize request; store it and compare on return. */
export function createState(): string {
  return randomUrlSafe(32)
}

/** Replay-protection `nonce`; store it and pass it to `verifyIdToken`. */
export function createNonce(): string {
  return randomUrlSafe(32)
}

/** RFC 7636 S256: base64url(SHA-256(ASCII(verifier))). */
export async function pkceChallenge(codeVerifier: string): Promise<string> {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier)) {
    throw new TypeError("code_verifier must be 43-128 unreserved characters")
  }
  const digest = await webCrypto().subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  )
  return base64UrlEncode(new Uint8Array(digest))
}

export type PkcePair = {
  codeVerifier: string
  codeChallenge: string
  codeChallengeMethod: "S256"
}

export async function createPkcePair(): Promise<PkcePair> {
  const codeVerifier = randomUrlSafe(32)
  return {
    codeVerifier,
    codeChallenge: await pkceChallenge(codeVerifier),
    codeChallengeMethod: "S256",
  }
}

export type AuthorizeUrlParams = {
  issuer?: string
  clientId: string
  redirectUri: string
  scopes: readonly OidcScope[]
  state: string
  nonce: string
  codeChallenge: string
  prompt?: "none" | "login" | "consent"
}

/** URL to send the user to; the redirect returns `code`, `state`, `iss`. */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(oidcEndpoints(params.issuer).authorization)
  const scopes = new Set<OidcScope>(["openid", ...params.scopes])
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", params.clientId)
  url.searchParams.set("redirect_uri", params.redirectUri)
  url.searchParams.set("scope", [...scopes].join(" "))
  url.searchParams.set("state", params.state)
  url.searchParams.set("nonce", params.nonce)
  url.searchParams.set("code_challenge", params.codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  if (params.prompt !== undefined) url.searchParams.set("prompt", params.prompt)
  return url.toString()
}

/** OAuth error from `/oauth/*` (`error`, `error_description`). */
export class OidcError extends Error {
  readonly status: number
  readonly error: string
  readonly errorDescription: string | null

  constructor(status: number, error: string, errorDescription: string | null) {
    super(errorDescription ?? error)
    this.name = "OidcError"
    this.status = status
    this.error = error
    this.errorDescription = errorDescription
  }
}

type ClientCredentials = {
  issuer?: string
  clientId: string
  /** Confidential clients only; never ship a secret to a browser. */
  clientSecret?: string
  fetch?: OidcFetch
}

function fetcher(custom: OidcFetch | undefined): OidcFetch {
  return (
    custom ??
    function globalFetch(input, init) {
      return globalThis.fetch(input, init)
    }
  )
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json()
    return body
  } catch {
    return undefined
  }
}

function oauthError(status: number, body: unknown): OidcError {
  if (isRecord(body) && typeof body.error === "string") {
    return new OidcError(
      status,
      body.error,
      typeof body.error_description === "string"
        ? body.error_description
        : null,
    )
  }
  return new OidcError(status, "server_error", null)
}

/** RFC 6749 §2.3.1: form-urlencode each part before Basic encoding. */
function basicAuthorization(clientId: string, clientSecret: string): string {
  const encode = (value: string) =>
    encodeURIComponent(value).replaceAll("%20", "+")
  const raw = `${encode(clientId)}:${encode(clientSecret)}`
  return `Basic ${base64Encode(new TextEncoder().encode(raw))}`
}

async function postForm(
  url: string,
  credentials: ClientCredentials,
  fields: Record<string, string>,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  }
  const body = new URLSearchParams(fields)
  if (credentials.clientSecret === undefined) {
    body.set("client_id", credentials.clientId)
  } else {
    headers.Authorization = basicAuthorization(
      credentials.clientId,
      credentials.clientSecret,
    )
  }
  return fetcher(credentials.fetch)(url, {
    method: "POST",
    headers,
    body: body.toString(),
  })
}

export type TokenSet = {
  accessToken: string
  tokenType: "Bearer"
  /** Seconds until the access token expires. */
  expiresIn: number
  idToken: string | null
  refreshToken: string | null
  scopes: string[]
}

async function tokenSet(response: Response): Promise<TokenSet> {
  const body = await readJson(response)
  if (!response.ok) throw oauthError(response.status, body)
  if (
    !isRecord(body) ||
    typeof body.access_token !== "string" ||
    typeof body.token_type !== "string" ||
    body.token_type.toLowerCase() !== "bearer" ||
    typeof body.expires_in !== "number"
  ) {
    throw new OidcError(response.status, "invalid_response", null)
  }
  return {
    accessToken: body.access_token,
    tokenType: "Bearer",
    expiresIn: body.expires_in,
    idToken: typeof body.id_token === "string" ? body.id_token : null,
    refreshToken:
      typeof body.refresh_token === "string" ? body.refresh_token : null,
    scopes:
      typeof body.scope === "string"
        ? body.scope.split(" ").filter((scope) => scope.length > 0)
        : [],
  }
}

export type ExchangeCodeParams = ClientCredentials & {
  code: string
  redirectUri: string
  codeVerifier: string
}

/** Authorization code → tokens. Verify `idToken` with `verifyIdToken`. */
export async function exchangeCode(
  params: ExchangeCodeParams,
): Promise<TokenSet> {
  const response = await postForm(oidcEndpoints(params.issuer).token, params, {
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  })
  return tokenSet(response)
}

export type RefreshTokensParams = ClientCredentials & {
  refreshToken: string
  /** Narrow the granted scopes; omit to keep them. */
  scopes?: readonly OidcScope[]
}

/** Rotates the refresh token: always store the returned `refreshToken`. */
export async function refreshTokens(
  params: RefreshTokensParams,
): Promise<TokenSet> {
  const fields: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  }
  if (params.scopes !== undefined) fields.scope = params.scopes.join(" ")
  const response = await postForm(
    oidcEndpoints(params.issuer).token,
    params,
    fields,
  )
  return tokenSet(response)
}

export type RevokeTokenParams = ClientCredentials & {
  token: string
  tokenTypeHint?: "access_token" | "refresh_token"
}

/** RFC 7009. Revoking a refresh token revokes its whole family. */
export async function revokeToken(params: RevokeTokenParams): Promise<void> {
  const fields: Record<string, string> = { token: params.token }
  if (params.tokenTypeHint !== undefined) {
    fields.token_type_hint = params.tokenTypeHint
  }
  const response = await postForm(
    oidcEndpoints(params.issuer).revocation,
    params,
    fields,
  )
  if (!response.ok) {
    throw oauthError(response.status, await readJson(response))
  }
}

/** Claims released by the granted scopes. */
export type MatchboxClaims = {
  sub: string
  wallet_address?: string
  wallet_network?: "mezo" | "mezo-testnet"
  discord_id?: string
  discord_username?: string
  discord_display_name?: string | null
  discord_avatar_url?: string | null
}

function releasedClaims(source: Record<string, unknown>): MatchboxClaims {
  if (typeof source.sub !== "string") {
    throw new OidcError(200, "invalid_response", "Missing sub claim")
  }
  const claims: MatchboxClaims = { sub: source.sub }
  if (typeof source.wallet_address === "string") {
    claims.wallet_address = source.wallet_address
  }
  if (
    source.wallet_network === "mezo" ||
    source.wallet_network === "mezo-testnet"
  ) {
    claims.wallet_network = source.wallet_network
  }
  if (typeof source.discord_id === "string") {
    claims.discord_id = source.discord_id
  }
  if (typeof source.discord_username === "string") {
    claims.discord_username = source.discord_username
  }
  for (const name of ["discord_display_name", "discord_avatar_url"] as const) {
    const value = source[name]
    if (typeof value === "string" || value === null) claims[name] = value
  }
  return claims
}

export type FetchUserinfoParams = {
  issuer?: string
  accessToken: string
  fetch?: OidcFetch
}

export async function fetchUserinfo(
  params: FetchUserinfoParams,
): Promise<MatchboxClaims> {
  const response = await fetcher(params.fetch)(
    oidcEndpoints(params.issuer).userinfo,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        Accept: "application/json",
      },
    },
  )
  const body = await readJson(response)
  if (!response.ok) throw oauthError(response.status, body)
  if (!isRecord(body)) {
    throw new OidcError(response.status, "invalid_response", null)
  }
  return releasedClaims(body)
}

export type IdTokenClaims = MatchboxClaims & {
  iss: string
  aud: string
  iat: number
  exp: number
  auth_time: number | null
  nonce: string
  azp: string | null
}

export type VerifyIdTokenOptions = {
  clientId: string
  issuer?: string
  /** The nonce you sent in `buildAuthorizeUrl`. */
  nonce: string
  /** Allowed clock skew in seconds (default 60). */
  clockToleranceSeconds?: number
  /** Key source override (defaults to the issuer's remote JWKS). */
  jwks?: JWTVerifyGetKey
  /** Custom fetch for the remote JWKS. */
  fetch?: OidcFetch
}

const remoteKeySets = new Map<string, JWTVerifyGetKey>()

function remoteJwks(jwksUrl: string, fetch: OidcFetch | undefined) {
  if (fetch !== undefined) {
    return createRemoteJWKSet(new URL(jwksUrl), {
      [customFetch]: function jwksFetch(url, init) {
        return fetch(url, {
          method: init.method,
          headers: Object.fromEntries(init.headers),
        })
      },
    })
  }
  const cached = remoteKeySets.get(jwksUrl)
  if (cached !== undefined) return cached
  const keySet = createRemoteJWKSet(new URL(jwksUrl))
  remoteKeySets.set(jwksUrl, keySet)
  return keySet
}

function numberClaim(payload: JWTPayload, name: string): number | null {
  const value = payload[name]
  return typeof value === "number" ? value : null
}

/**
 * Verifies an ES256 ID token: signature (issuer JWKS), `iss`, `aud`,
 * `exp`/`iat`, `nonce`, and `azp` when present.
 */
export async function verifyIdToken(
  idToken: string,
  options: VerifyIdTokenOptions,
): Promise<IdTokenClaims> {
  const endpoints = oidcEndpoints(options.issuer)
  const keys = options.jwks ?? remoteJwks(endpoints.jwks, options.fetch)
  const { payload } = await jwtVerify(idToken, keys, {
    issuer: endpoints.issuer,
    audience: options.clientId,
    algorithms: ["ES256"],
    clockTolerance: options.clockToleranceSeconds ?? 60,
    requiredClaims: ["sub", "iat", "exp", "nonce"],
  })
  if (payload.nonce !== options.nonce) {
    throw new OidcError(400, "invalid_token", "ID token nonce mismatch")
  }
  const azp = typeof payload.azp === "string" ? payload.azp : null
  if (azp !== null && azp !== options.clientId) {
    throw new OidcError(400, "invalid_token", "ID token azp mismatch")
  }
  const iat = numberClaim(payload, "iat")
  const exp = numberClaim(payload, "exp")
  if (iat === null || exp === null) {
    throw new OidcError(400, "invalid_token", "ID token missing iat/exp")
  }
  return {
    ...releasedClaims(payload),
    iss: endpoints.issuer,
    aud: options.clientId,
    iat,
    exp,
    auth_time: numberClaim(payload, "auth_time"),
    nonce: options.nonce,
    azp,
  }
}
