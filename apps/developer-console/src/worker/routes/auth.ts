import { okResponseSchema } from "@repo/platform-contracts/common"
import {
  googleNonceRequestSchema,
  googleNonceResponseSchema,
  googleSignInRequestSchema,
  googleStepUpRequestSchema,
  meResponseSchema,
  stepUpResponseSchema,
} from "@repo/platform-contracts/console"
import { PlatformError, jsonBody } from "@repo/platform-server"
import {
  type GoogleIdentity,
  avatarUrlFrom,
  isStaffIdentity,
} from "../auth/google"
import { issueGoogleNonce, takeGoogleNonce } from "../auth/google-nonce"
import { limitByIp } from "../auth/limits"
import { endSessionCookie, startSession } from "../auth/session"
import {
  type ConsoleApp,
  type ConsoleContext,
  audit,
  deps,
  logger,
  nowIso,
  requireAuth,
  stepUpWindowMs,
} from "../context"
import { buildMe, respond } from "../mappers"
import { type AccountRecord, StoreConflictError } from "../store/console-store"
import { acceptInvitation, createOrganizationWithOwner } from "./organizations"

function localPart(email: string): string {
  const local = email.split("@")[0] ?? ""
  return local.length > 0 ? local.slice(0, 80) : "Developer"
}

const googleFailed = () =>
  new PlatformError("unauthorized", { message: "Google sign-in failed." })

const nonceExpired = () =>
  new PlatformError("invalid_request", { message: "Expired. Try again." })

function googleConfig(c: ConsoleContext) {
  const { google } = deps(c)
  if (google === null) {
    throw new PlatformError("service_disabled", {
      message: "Google sign-in is not configured.",
    })
  }
  return google
}

/**
 * Verifies the ID token and that it carries the nonce this browser was
 * issued for `purpose` (and, for step-up, this session). The nonce cookie is
 * single-use: it is cleared whether or not verification succeeds.
 */
async function verifiedIdentity(
  c: ConsoleContext,
  credential: string,
  expected: { purpose: "sign-in" | "step-up"; sessionId: string | null },
): Promise<GoogleIdentity> {
  const google = googleConfig(c)
  const nonce = await takeGoogleNonce(c)
  if (
    nonce === null ||
    nonce.purpose !== expected.purpose ||
    nonce.sessionId !== expected.sessionId
  ) {
    throw nonceExpired()
  }
  const identity = await google.verifier.verify(credential)
  if (identity === null || identity.nonce !== nonce.nonce) {
    throw googleFailed()
  }
  if (!identity.emailVerified) {
    throw new PlatformError("forbidden", {
      message: "Use a Google account with a verified email.",
    })
  }
  return {
    ...identity,
    picture: avatarUrlFrom(identity.picture),
    email: identity.email.trim().toLowerCase(),
    hostedDomain: identity.hostedDomain?.toLowerCase() ?? null,
  }
}

/** Keeps the stored Google profile picture in step with the latest token. */
async function syncAvatar(
  c: ConsoleContext,
  account: AccountRecord,
  identity: GoogleIdentity,
): Promise<AccountRecord> {
  if (account.avatarUrl === identity.picture) return account
  return deps(c).store.updateAccount(account.id, {
    avatarUrl: identity.picture,
  })
}

/**
 * Finds the account for a Google identity, linking an account that has no
 * Google identity yet by its (verified) email, or creates it. `created`
 * drives first-organization setup.
 */
async function resolveAccount(
  c: ConsoleContext,
  identity: GoogleIdentity,
): Promise<{ account: AccountRecord; created: boolean }> {
  const { store } = deps(c)
  const verifiedAt = nowIso(c)
  const existing = await store.findAccountByGoogleSub(identity.sub)
  if (existing !== null) {
    if (existing.email === identity.email) {
      return { account: existing, created: false }
    }
    // The Google account's address changed; follow it when it is free.
    try {
      const account = await store.updateAccount(existing.id, {
        email: identity.email,
        emailVerifiedAt: verifiedAt,
      })
      return { account, created: false }
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error
      logger(c).warn({
        message: "Google email change collides with another account",
        accountId: existing.id,
      })
      return { account: existing, created: false }
    }
  }
  const byEmail = await store.findAccountByEmail(identity.email)
  if (byEmail !== null) {
    if (byEmail.googleSub !== null) {
      throw new PlatformError("conflict", {
        message: "This email is linked to another Google account.",
      })
    }
    const account = await store.updateAccount(byEmail.id, {
      googleSub: identity.sub,
      ...(byEmail.emailVerifiedAt === null
        ? { emailVerifiedAt: verifiedAt }
        : {}),
    })
    return { account, created: false }
  }
  let account: AccountRecord
  try {
    account = await store.createAccount({
      email: identity.email,
      displayName: (identity.name ?? localPart(identity.email)).slice(0, 80),
      emailVerifiedAt: verifiedAt,
      googleSub: identity.sub,
      avatarUrl: identity.picture,
    })
  } catch (error) {
    if (!(error instanceof StoreConflictError)) throw error
    throw new PlatformError("conflict", { message: "Try again." })
  }
  await audit(c, {
    action: "developer-account-created",
    targetType: "account",
    targetId: account.id,
    actorId: account.id,
    metadata: { method: "google" },
  })
  return { account, created: true }
}

/** Staff-domain accounts are operators; the grant is audited once. */
async function grantDomainStaff(
  c: ConsoleContext,
  account: AccountRecord,
  identity: GoogleIdentity,
): Promise<void> {
  const { store, config } = deps(c)
  if (!isStaffIdentity(identity, config.staffDomains)) return
  const previous = await store.setStaffRole(account.id, "operator")
  if (previous === "operator") return
  await audit(c, {
    action: "staff-role-granted",
    actorType: "system",
    actorId: null,
    targetType: "account",
    targetId: account.id,
    metadata: {
      role: "operator",
      previous,
      source: "google-workspace-domain",
      domain: identity.hostedDomain,
    },
  })
}

export default function registerAuthRoutes(app: ConsoleApp): void {
  // Google ----------------------------------------------------------------

  app.post("/api/auth/google/nonce", async (c) => {
    await limitByIp(c, "google-nonce")
    const body = await jsonBody(c, googleNonceRequestSchema)
    const google = googleConfig(c)
    const sessionId =
      body.purpose === "step-up" ? requireAuth(c).session.id : null
    const issued = await issueGoogleNonce(c, body.purpose, sessionId)
    return respond(c, googleNonceResponseSchema, {
      clientId: google.clientId,
      nonce: issued.nonce,
      expiresAt: new Date(issued.expiresAt).toISOString(),
    })
  })

  app.post("/api/auth/google", async (c) => {
    await limitByIp(c, "sign-in")
    const body = await jsonBody(c, googleSignInRequestSchema)
    const identity = await verifiedIdentity(c, body.credential, {
      purpose: "sign-in",
      sessionId: null,
    })
    const resolved = await resolveAccount(c, identity)
    const { created } = resolved
    const account = await syncAvatar(c, resolved.account, identity)
    if (account.disabledAt !== null) {
      throw new PlatformError("forbidden", { message: "Account disabled." })
    }
    await grantDomainStaff(c, account, identity)
    const invitation =
      body.invitationToken === undefined
        ? null
        : await acceptInvitation(c, account, body.invitationToken)
    if (created && invitation?.ok !== true) {
      await createOrganizationWithOwner(c, account, {
        name: account.displayName,
      })
    }
    // A fresh Google sign-in counts as a re-confirmation.
    const session = await startSession(c, account, { steppedUp: true })
    await audit(c, {
      action: "developer-signed-in",
      targetType: "session",
      targetId: session.id,
      metadata: { method: "google" },
    })
    return respond(c, meResponseSchema, await buildMe(c, requireAuth(c)))
  })

  // Step-up ---------------------------------------------------------------

  app.post("/api/auth/step-up/google", async (c) => {
    const auth = requireAuth(c)
    await limitByIp(c, "step-up")
    const body = await jsonBody(c, googleStepUpRequestSchema)
    const identity = await verifiedIdentity(c, body.credential, {
      purpose: "step-up",
      sessionId: auth.session.id,
    })
    if (auth.account.googleSub !== identity.sub) {
      throw new PlatformError("forbidden", {
        message: "Use the Google account you signed in with.",
      })
    }
    const { store, now } = deps(c)
    const at = now()
    await store.updateSession(auth.session.id, {
      steppedUpAt: at.toISOString(),
    })
    await audit(c, {
      action: "developer-step-up-completed",
      targetType: "session",
      targetId: auth.session.id,
      metadata: { method: "google" },
    })
    return respond(c, stepUpResponseSchema, {
      steppedUpUntil: new Date(at.getTime() + stepUpWindowMs).toISOString(),
    })
  })

  // Sign-out --------------------------------------------------------------

  app.post("/api/auth/sign-out", async (c) => {
    const auth = c.get("auth")
    if (auth !== null) {
      await deps(c).store.updateSession(auth.session.id, {
        revokedAt: nowIso(c),
      })
      await audit(c, {
        action: "developer-signed-out",
        targetType: "session",
        targetId: auth.session.id,
      })
    }
    endSessionCookie(c)
    return respond(c, okResponseSchema, { ok: true })
  })

  // Memory-mode development only -----------------------------------------

  app.post("/api/auth/dev-sign-in", async (c) => {
    const { flags, store, config } = deps(c)
    if (!flags.devSignIn || config.production) {
      throw new PlatformError("not_found")
    }
    const account = await store.findAccountByEmail(config.devAccountEmail)
    if (account === null) throw new PlatformError("not_found")
    logger(c).warn({ message: "Dev sign-in used", accountId: account.id })
    const session = await startSession(c, account, { steppedUp: true })
    await audit(c, {
      action: "developer-signed-in",
      targetType: "session",
      targetId: session.id,
      metadata: { method: "dev-sign-in" },
      actorId: account.id,
    })
    return respond(c, meResponseSchema, await buildMe(c, requireAuth(c)))
  })

  app.post("/api/auth/dev-step-up", async (c) => {
    const { flags, store, config, now } = deps(c)
    if (!flags.devSignIn || config.production) {
      throw new PlatformError("not_found")
    }
    const auth = requireAuth(c)
    const at = now()
    await store.updateSession(auth.session.id, {
      steppedUpAt: at.toISOString(),
    })
    return respond(c, stepUpResponseSchema, {
      steppedUpUntil: new Date(at.getTime() + stepUpWindowMs).toISOString(),
    })
  })
}
