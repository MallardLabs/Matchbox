import type { AuditEventInput } from "@repo/platform-contracts/audit"
import {
  PlatformError,
  type RateLimitClient,
  currentRequestId,
  ipPrefix,
  requestLogger,
} from "@repo/platform-server"
import type { Context, Hono } from "hono"
import type { WebauthnConfig } from "./auth/webauthn"
import type { EmailSender } from "./email/sender"
import type { EmailContent } from "./email/templates"
import type {
  AccountRecord,
  ConsoleStore,
  PasskeyRecord,
  SessionRecord,
} from "./store/console-store"
import type { UsageAnalytics } from "./usage/analytics"

/** Everything `createApp` needs; `index.ts` wires the real implementations. */
export type ConsoleDeps = {
  store: ConsoleStore
  rateLimits: RateLimitClient
  email: EmailSender
  analytics: UsageAnalytics
  webauthn: WebauthnConfig
  now: () => Date
  flags: {
    consoleEnabled: boolean
    /** `POST /api/auth/dev-sign-in` (memory store, non-production only). */
    devSignIn: boolean
  }
  config: {
    production: boolean
    /** Origin of the console; CSRF allow-list and email links. */
    consoleOrigin: string
    sessionPepper: string
    apiKeyPepper: string
    clientSecretPepper: string
    /** Account id `dev-sign-in` signs in as (memory mode). */
    devAccountEmail: string
  }
}

export type AuthContext = {
  session: SessionRecord
  account: AccountRecord
}

export type ConsoleEnv = {
  Variables: {
    deps: ConsoleDeps
    auth: AuthContext | null
  }
}

export type ConsoleApp = Hono<ConsoleEnv>
export type ConsoleContext = Context<ConsoleEnv>

export function deps(c: ConsoleContext): ConsoleDeps {
  return c.get("deps")
}

export function nowIso(c: ConsoleContext): string {
  return deps(c).now().toISOString()
}

/** The signed-in account, or 401 `unauthorized`. */
export function requireAuth(c: ConsoleContext): AuthContext {
  const auth = c.get("auth")
  if (auth === null) throw new PlatformError("unauthorized")
  return auth
}

export const stepUpWindowMs = 10 * 60_000

export function steppedUpUntil(
  session: SessionRecord,
  now: Date,
): string | null {
  if (session.steppedUpAt === null) return null
  const until = Date.parse(session.steppedUpAt) + stepUpWindowMs
  return until > now.getTime() ? new Date(until).toISOString() : null
}

/** A passkey added through email recovery cannot step up for 24 h. */
export const recoveryStepUpBlockMs = 24 * 60 * 60_000

/**
 * Whether an assertion with `passkey` may step up a session (or yield a
 * stepped-up sign-in). Recovery passkeys are blocked until
 * `stepUpBlockedUntil`; pre-existing passkeys are not.
 */
export function passkeyMayStepUp(
  passkey: Pick<PasskeyRecord, "stepUpBlockedUntil">,
  now: Date,
): boolean {
  return (
    passkey.stepUpBlockedUntil === null ||
    Date.parse(passkey.stepUpBlockedUntil) <= now.getTime()
  )
}

/** 403 `step_up_required` unless a passkey assertion happened < 10 min ago. */
export function requireStepUp(c: ConsoleContext): AuthContext {
  const auth = requireAuth(c)
  if (steppedUpUntil(auth.session, deps(c).now()) === null) {
    throw new PlatformError("step_up_required")
  }
  return auth
}

export type AuditInput = Omit<
  AuditEventInput,
  "actorType" | "actorId" | "ipPrefix" | "requestId"
> & {
  actorType?: AuditEventInput["actorType"]
  actorId?: string | null
}

/** Records an audit event for the current request and actor. */
export async function audit(
  c: ConsoleContext,
  event: AuditInput,
): Promise<void> {
  const auth = c.get("auth")
  await deps(c).store.recordAudit({
    ...event,
    actorType: event.actorType ?? "developer",
    actorId: event.actorId ?? auth?.account.id ?? null,
    ipPrefix: ipPrefix(c.req.raw),
    requestId: currentRequestId(c),
  })
}

export function logger(c: ConsoleContext) {
  return requestLogger(c)
}

/** Sends a security notification; failures are logged, never thrown. */
export async function notifyAccount(
  c: ConsoleContext,
  account: Pick<AccountRecord, "id" | "email">,
  content: EmailContent,
): Promise<void> {
  try {
    await deps(c).email.send({ to: account.email, ...content })
  } catch (error) {
    logger(c).error({
      message: "Security notification email failed",
      accountId: account.id,
      subject: content.subject,
      error,
    })
  }
}
