import {
  type Jwks,
  type SigningJwk,
  publicJwkFromSigningJwk,
} from "@repo/platform-contracts/oidc"
import {
  type CryptoKey,
  type JWTPayload,
  SignJWT,
  createLocalJWKSet,
  importJWK,
  jwtVerify,
} from "jose"

/** ES256 signing with the first `OIDC_SIGNING_KEYS` entry; all verify. */
export type SigningKeys = {
  jwks: Jwks
  sign(
    payload: JWTPayload,
    options: { type: "JWT" | "at+jwt" },
  ): Promise<string>
  /**
   * Verified payload, or null for a bad signature, issuer, `typ` header,
   * expiry or (when given) audience.
   */
  verify(
    token: string,
    options: {
      issuer: string
      type: "JWT" | "at+jwt"
      audience?: string
      currentDate: Date
    },
  ): Promise<JWTPayload | null>
}

export async function createSigningKeys(
  keys: readonly SigningJwk[],
): Promise<SigningKeys> {
  const [active] = keys
  if (active === undefined) throw new Error("OIDC_SIGNING_KEYS is empty")
  const imported: CryptoKey | Uint8Array = await importJWK(
    { ...active, alg: "ES256" },
    "ES256",
  )
  const jwks: Jwks = { keys: keys.map((key) => publicJwkFromSigningJwk(key)) }
  const keySet = createLocalJWKSet(jwks)
  const kid = active.kid

  return {
    jwks,
    sign(payload, options) {
      return new SignJWT(payload)
        .setProtectedHeader({ alg: "ES256", kid, typ: options.type })
        .sign(imported)
    },
    async verify(token, options) {
      try {
        const { payload } = await jwtVerify(token, keySet, {
          algorithms: ["ES256"],
          issuer: options.issuer,
          typ: options.type,
          ...(options.audience === undefined
            ? {}
            : { audience: options.audience }),
          currentDate: options.currentDate,
        })

        return payload
      } catch {
        return null
      }
    },
  }
}
