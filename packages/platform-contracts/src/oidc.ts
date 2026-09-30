import { z } from "zod"
import { addressSchema } from "./common"
import { clientIdSchema, pairwiseSubjectSchema } from "./credentials"
import { networkSlugSchema } from "./network"
import { type OidcScope, claimsForScopes, oidcClaimSchema } from "./scopes"

export const matchboxIdIssuer = "https://id.matchbox.markets"

/** Lifetimes in seconds. */
export const oidcLifetimes = {
  authorizationRequest: 600,
  authorizationCode: 60,
  accessToken: 600,
  idToken: 600,
  refreshToken: 30 * 24 * 60 * 60,
  siweNonce: 600,
  session: 7 * 24 * 60 * 60,
} as const

export const oidcEndpointPaths = {
  discovery: "/.well-known/openid-configuration",
  authorization: "/oauth/authorize",
  token: "/oauth/token",
  userinfo: "/oauth/userinfo",
  jwks: "/oauth/jwks",
  revocation: "/oauth/revoke",
} as const

export const tokenEndpointAuthMethodSchema = z.enum([
  "client_secret_basic",
  "client_secret_post",
  "none",
])

export type TokenEndpointAuthMethod = z.infer<
  typeof tokenEndpointAuthMethodSchema
>

export const standardIdTokenClaims = [
  "iss",
  "aud",
  "sub",
  "iat",
  "exp",
  "auth_time",
  "nonce",
  "azp",
] as const

export const discoveryDocumentSchema = z.object({
  issuer: z.url(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  userinfo_endpoint: z.url(),
  jwks_uri: z.url(),
  revocation_endpoint: z.url(),
  scopes_supported: z.array(z.string()),
  response_types_supported: z.array(z.literal("code")),
  response_modes_supported: z.array(z.literal("query")),
  grant_types_supported: z.array(
    z.enum(["authorization_code", "refresh_token"]),
  ),
  subject_types_supported: z.array(z.literal("pairwise")),
  id_token_signing_alg_values_supported: z.array(z.literal("ES256")),
  token_endpoint_auth_methods_supported: z.array(tokenEndpointAuthMethodSchema),
  revocation_endpoint_auth_methods_supported: z.array(
    tokenEndpointAuthMethodSchema,
  ),
  code_challenge_methods_supported: z.array(z.literal("S256")),
  claims_supported: z.array(z.string()),
  prompt_values_supported: z.array(z.string()),
  claims_parameter_supported: z.literal(false),
  request_parameter_supported: z.literal(false),
  request_uri_parameter_supported: z.literal(false),
  authorization_response_iss_parameter_supported: z.literal(true),
  service_documentation: z.url(),
})

export type DiscoveryDocument = z.infer<typeof discoveryDocumentSchema>

export const promptSchema = z.enum(["none", "login", "consent"])

export type Prompt = z.infer<typeof promptSchema>

export function buildDiscoveryDocument(input: {
  issuer: string
  scopes: readonly OidcScope[]
}): DiscoveryDocument {
  const issuer = input.issuer.replace(/\/+$/, "")
  const authMethods: TokenEndpointAuthMethod[] = [
    "client_secret_basic",
    "client_secret_post",
    "none",
  ]
  return {
    issuer,
    authorization_endpoint: `${issuer}${oidcEndpointPaths.authorization}`,
    token_endpoint: `${issuer}${oidcEndpointPaths.token}`,
    userinfo_endpoint: `${issuer}${oidcEndpointPaths.userinfo}`,
    jwks_uri: `${issuer}${oidcEndpointPaths.jwks}`,
    revocation_endpoint: `${issuer}${oidcEndpointPaths.revocation}`,
    scopes_supported: [...input.scopes],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["pairwise"],
    id_token_signing_alg_values_supported: ["ES256"],
    token_endpoint_auth_methods_supported: authMethods,
    revocation_endpoint_auth_methods_supported: authMethods,
    code_challenge_methods_supported: ["S256"],
    claims_supported: [
      ...new Set<string>([
        ...standardIdTokenClaims,
        ...claimsForScopes(input.scopes),
      ]),
    ],
    prompt_values_supported: [...promptSchema.options],
    claims_parameter_supported: false,
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
    authorization_response_iss_parameter_supported: true,
    service_documentation: "https://developer.matchbox.markets/docs/oidc",
  }
}

const pkceValuePattern = /^[A-Za-z0-9._~-]{43,128}$/

/** RFC 7636 code verifier. */
export const codeVerifierSchema = z
  .string()
  .regex(pkceValuePattern, "Expected a 43-128 character PKCE verifier")

/** S256 code challenge: base64url(SHA-256(verifier)), 43 characters. */
export const codeChallengeSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "Expected an S256 code challenge")

/** `GET /oauth/authorize` query parameters (validated after client lookup). */
export const authorizeRequestSchema = z.object({
  response_type: z.literal("code"),
  client_id: clientIdSchema,
  redirect_uri: z.string().min(1).max(2048),
  scope: z.string().min(1).max(512),
  state: z.string().min(1).max(1024),
  code_challenge: codeChallengeSchema,
  code_challenge_method: z.literal("S256"),
  nonce: z.string().min(1).max(256).optional(),
  prompt: promptSchema.optional(),
})

export type AuthorizeRequest = z.infer<typeof authorizeRequestSchema>

/** Parameters the authorize endpoint needs before it may redirect errors. */
export const authorizeClientParamsSchema = z.object({
  client_id: clientIdSchema,
  redirect_uri: z.string().min(1).max(2048),
})

const clientCredentialFields = {
  client_id: clientIdSchema.optional(),
  client_secret: z.string().min(1).max(256).optional(),
}

export const authorizationCodeTokenRequestSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1).max(256),
  redirect_uri: z.string().min(1).max(2048),
  code_verifier: codeVerifierSchema,
  ...clientCredentialFields,
})

export const refreshTokenRequestSchema = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1).max(256),
  scope: z.string().min(1).max(512).optional(),
  ...clientCredentialFields,
})

/** `POST /oauth/token` form body. */
export const tokenRequestSchema = z.discriminatedUnion("grant_type", [
  authorizationCodeTokenRequestSchema,
  refreshTokenRequestSchema,
])

export type TokenRequest = z.infer<typeof tokenRequestSchema>

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  refresh_token: z.string(),
  id_token: z.string().optional(),
  scope: z.string(),
})

export type TokenResponse = z.infer<typeof tokenResponseSchema>

/** `POST /oauth/revoke` form body (RFC 7009). */
export const revokeRequestSchema = z.object({
  token: z.string().min(1).max(4096),
  token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
  ...clientCredentialFields,
})

export type RevokeRequest = z.infer<typeof revokeRequestSchema>

const releasedClaimFields = {
  wallet_address: addressSchema.optional(),
  wallet_network: networkSlugSchema.optional(),
  discord_id: z.string().optional(),
  discord_username: z.string().optional(),
  discord_display_name: z.string().nullable().optional(),
  discord_avatar_url: z.string().nullable().optional(),
}

export const userinfoResponseSchema = z.object({
  sub: pairwiseSubjectSchema,
  ...releasedClaimFields,
})

export type UserinfoResponse = z.infer<typeof userinfoResponseSchema>

export const idTokenClaimsSchema = z.object({
  iss: z.url(),
  aud: clientIdSchema,
  sub: pairwiseSubjectSchema,
  iat: z.number().int(),
  exp: z.number().int(),
  auth_time: z.number().int(),
  nonce: z.string().optional(),
  azp: clientIdSchema,
  ...releasedClaimFields,
})

export type IdTokenClaims = z.infer<typeof idTokenClaimsSchema>

/** Claims inside the ES256 access token JWT. */
export const accessTokenClaimsSchema = z.object({
  iss: z.url(),
  aud: z.url(),
  sub: pairwiseSubjectSchema,
  client_id: clientIdSchema,
  scope: z.string(),
  jti: z.string().min(16).max(64),
  iat: z.number().int(),
  exp: z.number().int(),
})

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>

export const publicJwkSchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string().min(1),
  y: z.string().min(1),
  kid: z.string().min(1),
  alg: z.literal("ES256"),
  use: z.literal("sig"),
})

export type PublicJwk = z.infer<typeof publicJwkSchema>

export const jwksSchema = z.object({ keys: z.array(publicJwkSchema) })

export type Jwks = z.infer<typeof jwksSchema>

/** One entry of the `OIDC_SIGNING_KEYS` secret (private ES256 JWK). */
export const signingJwkSchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string().min(1),
  y: z.string().min(1),
  d: z.string().min(1),
  kid: z.string().min(1),
  alg: z.literal("ES256").optional(),
})

export type SigningJwk = z.infer<typeof signingJwkSchema>

/** `OIDC_SIGNING_KEYS`: index 0 signs; every key is published in JWKS. */
export const signingJwksSchema = z.array(signingJwkSchema).min(1)

export function publicJwkFromSigningJwk(key: SigningJwk): PublicJwk {
  return {
    kty: key.kty,
    crv: key.crv,
    x: key.x,
    y: key.y,
    kid: key.kid,
    alg: "ES256",
    use: "sig",
  }
}

export const releasableClaimSchema = oidcClaimSchema.exclude(["sub"])
