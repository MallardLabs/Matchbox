import type { GoogleNoncePurpose } from "@repo/platform-contracts/console"
import { googleNoncePurposeSchema } from "@repo/platform-contracts/console"
import {
  base64UrlDecode,
  parseJson,
  utf8Decode,
  utf8Encode,
} from "@repo/platform-contracts/encoding"
import {
  base64UrlEncode,
  clearSessionCookie,
  generateOpaqueToken,
  hmacHex,
  readSessionCookie,
  setSessionCookie,
  timingSafeEqualHex,
} from "@repo/platform-server"
import { z } from "zod"
import { type ConsoleContext, deps } from "../context"

/**
 * Nonces for the GIS button. `__Host-mbx_dev_google` holds a random binding
 * for this browser (10 min, refreshed by every issue). A nonce is
 * base64url(JSON) + "." + 64 hex HMAC(SESSION_PEPPER) over the payload, the
 * binding and, for step-up, the session id. The nonce comes back inside the
 * ID token, so a token minted for another browser, purpose or session is
 * refused.
 *
 * Issuing never invalidates earlier nonces: every tab, re-render and retry in
 * this browser shares the binding, and a failed attempt leaves it in place.
 * Only an accepted nonce clears it, which makes the nonce (and its ID token)
 * single-use.
 */

const cookieName = "mbx_dev_google"
export const googleNonceLifetimeMs = 10 * 60_000
const signatureLength = 64
const minBindingLength = 32
const maxNonceLength = 512

const payloadSchema = z.object({
  purpose: googleNoncePurposeSchema,
  expiresAt: z.number().int(),
  id: z.string().min(1),
})

type NoncePayload = z.infer<typeof payloadSchema>

export type IssuedGoogleNonce = { nonce: string; expiresAt: number }

/** What the nonce in a verified ID token turned out to be. */
export type GoogleNonceCheck =
  /** Issued to this browser for this purpose (and session); now consumed. */
  | "accepted"
  /** Missing or not one of ours: the token was minted for another page. */
  | "foreign"
  /** Ours, but expired, for another purpose or session, or another binding. */
  | "stale"

function sign(
  pepper: string,
  payload: string,
  binding: string,
  sessionId: string | null,
): Promise<string> {
  return hmacHex(
    pepper,
    `google-nonce:${payload}:${binding}:${sessionId ?? ""}`,
  )
}

function readBinding(c: ConsoleContext): string | null {
  const value = readSessionCookie(c, cookieName)
  return value !== null && value.length >= minBindingLength ? value : null
}

function parseNonce(
  nonce: string,
): { payload: string; signature: string; state: NoncePayload } | null {
  if (nonce.length > maxNonceLength) return null
  const separator = nonce.lastIndexOf(".")
  if (separator <= 0) return null
  const payload = nonce.slice(0, separator)
  const signature = nonce.slice(separator + 1)
  if (signature.length !== signatureLength) return null
  const bytes = base64UrlDecode(payload)
  const text = bytes === null ? null : utf8Decode(bytes)
  const json = text === null ? null : parseJson(text)
  if (json === null || !json.ok) return null
  const parsed = payloadSchema.safeParse(json.value)
  return parsed.success ? { payload, signature, state: parsed.data } : null
}

/** Issues a nonce, creating or refreshing this browser's binding. */
export async function issueGoogleNonce(
  c: ConsoleContext,
  purpose: GoogleNoncePurpose,
  sessionId: string | null,
): Promise<IssuedGoogleNonce> {
  const { config, now } = deps(c)
  const binding = readBinding(c) ?? generateOpaqueToken()
  setSessionCookie(c, cookieName, binding, googleNonceLifetimeMs / 1000)
  const state: NoncePayload = {
    purpose,
    expiresAt: now().getTime() + googleNonceLifetimeMs,
    id: generateOpaqueToken(),
  }
  const payload = base64UrlEncode(utf8Encode(JSON.stringify(state)))
  const signature = await sign(
    config.sessionPepper,
    payload,
    binding,
    sessionId,
  )
  return { nonce: `${payload}.${signature}`, expiresAt: state.expiresAt }
}

/** False when this browser holds no binding: every nonce it has is stale. */
export function hasGoogleNonceBinding(c: ConsoleContext): boolean {
  return readBinding(c) !== null
}

/**
 * Checks the nonce claim of a verified ID token against this browser's
 * binding, `purpose` and session. An accepted nonce clears the binding.
 */
export async function takeGoogleNonce(
  c: ConsoleContext,
  nonce: string | null,
  expected: { purpose: GoogleNoncePurpose; sessionId: string | null },
): Promise<GoogleNonceCheck> {
  const parsed = nonce === null ? null : parseNonce(nonce)
  if (parsed === null) return "foreign"
  const binding = readBinding(c)
  if (binding === null) return "stale"
  const { config, now } = deps(c)
  const signed = timingSafeEqualHex(
    await sign(
      config.sessionPepper,
      parsed.payload,
      binding,
      expected.sessionId,
    ),
    parsed.signature,
  )
  if (
    !signed ||
    parsed.state.purpose !== expected.purpose ||
    parsed.state.expiresAt <= now().getTime()
  ) {
    return "stale"
  }
  clearSessionCookie(c, cookieName)
  return "accepted"
}
