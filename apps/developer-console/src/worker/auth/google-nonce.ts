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
 * `__Host-mbx_dev_google`: signed, single-use nonce for one Google sign-in or
 * step-up. The nonce goes into the GIS button and comes back inside the ID
 * token, so a token minted for another page, browser or purpose is refused.
 * Step-up nonces are bound to the session that asked for them. Value =
 * base64url(JSON) + 64 hex HMAC(SESSION_PEPPER).
 */

const cookieName = "mbx_dev_google"
export const googleNonceLifetimeMs = 10 * 60_000
const signatureLength = 64

const nonceStateSchema = z.object({
  nonce: z.string().min(1),
  purpose: googleNoncePurposeSchema,
  sessionId: z.uuid().nullable(),
  expiresAt: z.number().int(),
})

export type GoogleNonceState = z.infer<typeof nonceStateSchema>

function sign(pepper: string, payload: string): Promise<string> {
  return hmacHex(pepper, `google-nonce:${payload}`)
}

export async function issueGoogleNonce(
  c: ConsoleContext,
  purpose: GoogleNoncePurpose,
  sessionId: string | null,
): Promise<GoogleNonceState> {
  const { config, now } = deps(c)
  const state: GoogleNonceState = {
    nonce: generateOpaqueToken(),
    purpose,
    sessionId,
    expiresAt: now().getTime() + googleNonceLifetimeMs,
  }
  const payload = base64UrlEncode(utf8Encode(JSON.stringify(state)))
  const signature = await sign(config.sessionPepper, payload)
  setSessionCookie(
    c,
    cookieName,
    `${payload}${signature}`,
    googleNonceLifetimeMs / 1000,
  )
  return state
}

/** Reads and clears the nonce; null when missing, tampered or expired. */
export async function takeGoogleNonce(
  c: ConsoleContext,
): Promise<GoogleNonceState | null> {
  const value = readSessionCookie(c, cookieName)
  clearSessionCookie(c, cookieName)
  if (value === null || value.length <= signatureLength) return null
  const payload = value.slice(0, -signatureLength)
  const signature = value.slice(-signatureLength)
  const { config, now } = deps(c)
  if (
    !timingSafeEqualHex(await sign(config.sessionPepper, payload), signature)
  ) {
    return null
  }
  const bytes = base64UrlDecode(payload)
  const text = bytes === null ? null : utf8Decode(bytes)
  const json = text === null ? null : parseJson(text)
  if (json === null || !json.ok) return null
  const parsed = nonceStateSchema.safeParse(json.value)
  if (!parsed.success || parsed.data.expiresAt <= now().getTime()) return null
  return parsed.data
}
