import type { EmailChallengePurpose } from "@repo/platform-contracts/console"
import {
  PlatformError,
  generateEmailCode,
  hmacHex,
  timingSafeEqualHex,
} from "@repo/platform-server"
import { type ConsoleContext, deps, logger } from "../context"
import type { EmailContent } from "../email/templates"
import type { EmailChallengeRecord } from "../store/console-store"

/**
 * 6-digit email codes: stored as HMAC(SESSION_PEPPER, id + code), 15 min,
 * 5 attempts, single use.
 */

export const emailCodeLifetimeMs = 15 * 60_000
export const maxEmailCodeAttempts = 5

export function emailCodeHash(
  pepper: string,
  challengeId: string,
  code: string,
): Promise<string> {
  return hmacHex(pepper, `email-code:${challengeId}:${code}`)
}

export type IssuedChallenge = { challengeId: string; expiresAt: string }

/**
 * Always creates a challenge row so the response is identical for every
 * address. `email` decides what (if anything) is sent: `code` embeds the
 * real code; any other content is sent instead and the stored code is
 * unguessable.
 */
export async function issueEmailChallenge(
  c: ConsoleContext,
  input: {
    email: string
    purpose: EmailChallengePurpose
    message: ((code: string) => EmailContent) | EmailContent | null
  },
): Promise<IssuedChallenge> {
  const { store, now, config, email } = deps(c)
  const createdAt = now()
  const id = crypto.randomUUID()
  const code = generateEmailCode()
  const expiresAt = new Date(createdAt.getTime() + emailCodeLifetimeMs)
  await store.createEmailChallenge({
    id,
    email: input.email,
    purpose: input.purpose,
    codeHash: await emailCodeHash(config.sessionPepper, id, code),
    expiresAt: expiresAt.toISOString(),
    createdAt: createdAt.toISOString(),
  })
  const content =
    typeof input.message === "function" ? input.message(code) : input.message
  if (content !== null) {
    try {
      await email.send({ ...content, to: input.email })
    } catch (error) {
      // Same response either way; the failure is only visible in logs.
      logger(c).error({
        message: "Email send failed",
        purpose: input.purpose,
        challengeId: id,
        error,
      })
    }
  }
  return { challengeId: id, expiresAt: expiresAt.toISOString() }
}

const invalidCode = () =>
  new PlatformError("invalid_request", {
    message: "Invalid or expired code.",
  })

/** Consumes the challenge when the code matches; otherwise 400. */
export async function verifyEmailChallenge(
  c: ConsoleContext,
  input: {
    challengeId: string
    code: string
    purpose: EmailChallengePurpose
  },
): Promise<EmailChallengeRecord> {
  const { store, now, config } = deps(c)
  const current = now()
  const challenge = await store.getEmailChallenge(input.challengeId)
  if (
    challenge === null ||
    challenge.purpose !== input.purpose ||
    challenge.consumedAt !== null ||
    Date.parse(challenge.expiresAt) <= current.getTime() ||
    challenge.attempts >= maxEmailCodeAttempts
  ) {
    throw invalidCode()
  }
  const attempts = await store.incrementEmailChallengeAttempts(challenge.id)
  if (attempts > maxEmailCodeAttempts) throw invalidCode()
  const expected = await emailCodeHash(
    config.sessionPepper,
    challenge.id,
    input.code,
  )
  if (!timingSafeEqualHex(expected, challenge.codeHash)) throw invalidCode()
  if (
    !(await store.consumeEmailChallenge(challenge.id, current.toISOString()))
  ) {
    throw invalidCode()
  }
  return challenge
}
