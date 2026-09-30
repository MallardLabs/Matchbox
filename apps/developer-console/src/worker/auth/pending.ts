import {
  base64UrlDecode,
  parseJson,
  utf8Decode,
  utf8Encode,
} from "@repo/platform-contracts/encoding"
import {
  base64UrlEncode,
  clearSessionCookie,
  hmacHex,
  readSessionCookie,
  setSessionCookie,
  timingSafeEqualHex,
} from "@repo/platform-server"
import { z } from "zod"
import { type ConsoleContext, deps } from "../context"

/**
 * `__Host-mbx_dev_pending`: signed, short-lived state for the unauthenticated
 * sign-up / recovery flow (display name and invitation token between the
 * email step and the passkey step, and proof that this browser verified the
 * email before it may register a passkey). Value = base64url(JSON) + 64 hex
 * HMAC(SESSION_PEPPER).
 */

const cookieName = "mbx_dev_pending"
const lifetimeSeconds = 20 * 60
const signatureLength = 64

const flowSchema = z.enum(["sign-up", "recovery"])

export const pendingStateSchema = z.discriminatedUnion("stage", [
  z.object({
    stage: z.literal("email"),
    flow: flowSchema,
    emailChallengeId: z.uuid(),
    displayName: z.string().max(80).nullable(),
    invitationToken: z.string().max(256).nullable(),
    expiresAt: z.number().int(),
  }),
  z.object({
    stage: z.literal("passkey"),
    flow: flowSchema,
    webauthnChallengeId: z.uuid(),
    accountId: z.uuid(),
    invitationToken: z.string().max(256).nullable(),
    expiresAt: z.number().int(),
  }),
])

export type PendingState = z.infer<typeof pendingStateSchema>

type PendingInput = PendingState extends infer State
  ? State extends PendingState
    ? Omit<State, "expiresAt">
    : never
  : never

function sign(pepper: string, payload: string): Promise<string> {
  return hmacHex(pepper, `pending:${payload}`)
}

export async function setPendingState(
  c: ConsoleContext,
  state: PendingInput,
): Promise<void> {
  const { config, now } = deps(c)
  const full = {
    ...state,
    expiresAt: now().getTime() + lifetimeSeconds * 1000,
  }
  const payload = base64UrlEncode(utf8Encode(JSON.stringify(full)))
  const signature = await sign(config.sessionPepper, payload)
  setSessionCookie(c, cookieName, `${payload}${signature}`, lifetimeSeconds)
}

export async function readPendingState(
  c: ConsoleContext,
): Promise<PendingState | null> {
  const value = readSessionCookie(c, cookieName)
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
  const parsed = pendingStateSchema.safeParse(json.value)
  if (!parsed.success || parsed.data.expiresAt <= now().getTime()) return null
  return parsed.data
}

export function clearPendingState(c: ConsoleContext): void {
  clearSessionCookie(c, cookieName)
}
