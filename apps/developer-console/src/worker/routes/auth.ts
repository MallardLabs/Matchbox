import { okResponseSchema } from "@repo/platform-contracts/common"
import {
  emailChallengeResponseSchema,
  emailCodeVerifyRequestSchema,
  meResponseSchema,
  passkeyAuthenticateRequestSchema,
  passkeyAuthenticationOptionsResponseSchema,
  passkeyRegisterRequestSchema,
  passkeyRegistrationOptionsResponseSchema,
  recoveryStartRequestSchema,
  signUpStartRequestSchema,
  stepUpResponseSchema,
} from "@repo/platform-contracts/console"
import { PlatformError, jsonBody } from "@repo/platform-server"
import { issueEmailChallenge, verifyEmailChallenge } from "../auth/email-codes"
import { limitByEmail, limitByIp } from "../auth/limits"
import {
  clearPendingState,
  readPendingState,
  setPendingState,
} from "../auth/pending"
import { endSessionCookie, startSession } from "../auth/session"
import {
  createAuthenticationOptions,
  createRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from "../auth/webauthn"
import {
  type ConsoleApp,
  type ConsoleContext,
  audit,
  deps,
  logger,
  notifyAccount,
  nowIso,
  passkeyMayStepUp,
  recoveryStepUpBlockMs,
  requireAuth,
  requireStepUp,
  stepUpWindowMs,
} from "../context"
import {
  accountRecoveredEmail,
  codeEmail,
  existingAccountEmail,
  passkeyChangedEmail,
} from "../email/templates"
import { buildMe, respond } from "../mappers"
import {
  type AccountRecord,
  StoreConflictError,
  type WebauthnChallengeRecord,
} from "../store/console-store"
import { acceptInvitation, createOrganizationWithOwner } from "./organizations"

export const webauthnChallengeLifetimeMs = 5 * 60_000

function localPart(email: string): string {
  const local = email.split("@")[0] ?? ""
  return local.length > 0 ? local.slice(0, 80) : "Developer"
}

async function registrationChallenge(
  c: ConsoleContext,
  account: AccountRecord,
) {
  const { store, now, webauthn } = deps(c)
  const existing = await store.listPasskeys(account.id)
  const options = await createRegistrationOptions({
    config: webauthn,
    account,
    existing,
  })
  const createdAt = now()
  const challenge = await store.createWebauthnChallenge({
    challenge: options.challenge,
    purpose: "register",
    accountId: account.id,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(
      createdAt.getTime() + webauthnChallengeLifetimeMs,
    ).toISOString(),
  })
  return { challengeId: challenge.id, options }
}

const recoveryPasskeyBlocked = () =>
  new PlatformError("forbidden", {
    message:
      "Passkeys added by recovery can confirm actions after 24 hours. Use an existing passkey.",
  })

/**
 * Discoverable sign-in (`account` null, UV preferred) or step-up (UV
 * required; only passkeys allowed to step up, so a passkey added through
 * recovery is excluded for 24 h).
 */
async function authenticationChallenge(
  c: ConsoleContext,
  purpose: "authenticate" | "step-up",
  account: AccountRecord | null,
) {
  const { store, now, webauthn } = deps(c)
  const at = now()
  const passkeys = account === null ? [] : await store.listPasskeys(account.id)
  const allow = passkeys.filter((passkey) => passkeyMayStepUp(passkey, at))
  if (account !== null && allow.length === 0) {
    throw passkeys.length === 0
      ? new PlatformError("forbidden", { message: "No passkey to confirm." })
      : recoveryPasskeyBlocked()
  }
  const options = await createAuthenticationOptions({
    config: webauthn,
    allow,
    userVerification: purpose === "step-up" ? "required" : "preferred",
  })
  const createdAt = now()
  const challenge = await store.createWebauthnChallenge({
    challenge: options.challenge,
    purpose,
    accountId: account?.id ?? null,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(
      createdAt.getTime() + webauthnChallengeLifetimeMs,
    ).toISOString(),
  })
  return { challengeId: challenge.id, options }
}

async function consumeChallenge(
  c: ConsoleContext,
  challengeId: string,
  purpose: WebauthnChallengeRecord["purpose"],
): Promise<WebauthnChallengeRecord> {
  const challenge = await deps(c).store.consumeWebauthnChallenge(
    challengeId,
    nowIso(c),
  )
  if (challenge === null || challenge.purpose !== purpose) {
    throw new PlatformError("invalid_request", {
      message: "Challenge expired. Try again.",
    })
  }
  return challenge
}

type RegistrationFlow = "sign-up" | "recovery" | "add"

/** A signed-in add, a first-passkey sign-up, or (otherwise) a recovery. */
function registrationFlow(
  signedIn: boolean,
  pendingFlow: "sign-up" | "recovery" | null,
  existingPasskeys: number,
): RegistrationFlow {
  if (signedIn) return "add"
  return pendingFlow === "sign-up" && existingPasskeys === 0
    ? "sign-up"
    : "recovery"
}

const passkeyFailed = () =>
  new PlatformError("unauthorized", { message: "Passkey not recognized." })

export default function registerAuthRoutes(app: ConsoleApp): void {
  // Sign-up ---------------------------------------------------------------

  app.post("/api/auth/sign-up/start", async (c) => {
    await limitByIp(c, "sign-up")
    const body = await jsonBody(c, signUpStartRequestSchema)
    await limitByEmail(c, "code", body.email)
    const { store, config } = deps(c)
    const account = await store.findAccountByEmail(body.email)
    const registered =
      account !== null && (await store.listPasskeys(account.id)).length > 0
    const issued = await issueEmailChallenge(c, {
      email: body.email,
      purpose: "sign-up",
      message: registered
        ? existingAccountEmail(`${config.consoleOrigin}/sign-in`)
        : (code) => codeEmail(code, "sign-up"),
    })
    await setPendingState(c, {
      stage: "email",
      flow: "sign-up",
      emailChallengeId: issued.challengeId,
      displayName: body.displayName,
      invitationToken: body.invitationToken ?? null,
    })
    return respond(c, emailChallengeResponseSchema, issued)
  })

  app.post("/api/auth/sign-up/verify", async (c) => {
    await limitByIp(c, "verify")
    const body = await jsonBody(c, emailCodeVerifyRequestSchema)
    const challenge = await verifyEmailChallenge(c, {
      ...body,
      purpose: "sign-up",
    })
    const { store } = deps(c)
    const pending = await readPendingState(c)
    const fromPending =
      pending?.stage === "email" && pending.emailChallengeId === challenge.id
        ? pending
        : null
    const verifiedAt = nowIso(c)
    let account = await store.findAccountByEmail(challenge.email)
    if (account === null) {
      try {
        account = await store.createAccount({
          email: challenge.email,
          displayName: fromPending?.displayName ?? localPart(challenge.email),
          emailVerifiedAt: verifiedAt,
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
      })
    } else {
      if (
        account.disabledAt !== null ||
        (await store.listPasskeys(account.id)).length > 0
      ) {
        throw new PlatformError("invalid_request", {
          message: "Invalid or expired code.",
        })
      }
      const pendingName = fromPending?.displayName ?? null
      account = await store.updateAccount(account.id, {
        ...(pendingName === null ? {} : { displayName: pendingName }),
        ...(account.emailVerifiedAt === null
          ? { emailVerifiedAt: verifiedAt }
          : {}),
      })
    }
    const registration = await registrationChallenge(c, account)
    await setPendingState(c, {
      stage: "passkey",
      flow: "sign-up",
      webauthnChallengeId: registration.challengeId,
      accountId: account.id,
      invitationToken: fromPending?.invitationToken ?? null,
    })
    return respond(c, passkeyRegistrationOptionsResponseSchema, registration)
  })

  // Recovery --------------------------------------------------------------

  app.post("/api/auth/recovery/start", async (c) => {
    await limitByIp(c, "recovery")
    const body = await jsonBody(c, recoveryStartRequestSchema)
    await limitByEmail(c, "code", body.email)
    const account = await deps(c).store.findAccountByEmail(body.email)
    const issued = await issueEmailChallenge(c, {
      email: body.email,
      purpose: "recovery",
      message:
        account === null || account.disabledAt !== null
          ? null
          : (code) => codeEmail(code, "recovery"),
    })
    await setPendingState(c, {
      stage: "email",
      flow: "recovery",
      emailChallengeId: issued.challengeId,
      displayName: null,
      invitationToken: null,
    })
    return respond(c, emailChallengeResponseSchema, issued)
  })

  app.post("/api/auth/recovery/verify", async (c) => {
    await limitByIp(c, "verify")
    const body = await jsonBody(c, emailCodeVerifyRequestSchema)
    const challenge = await verifyEmailChallenge(c, {
      ...body,
      purpose: "recovery",
    })
    const account = await deps(c).store.findAccountByEmail(challenge.email)
    if (account === null || account.disabledAt !== null) {
      throw new PlatformError("invalid_request", {
        message: "Invalid or expired code.",
      })
    }
    const registration = await registrationChallenge(c, account)
    await setPendingState(c, {
      stage: "passkey",
      flow: "recovery",
      webauthnChallengeId: registration.challengeId,
      accountId: account.id,
      invitationToken: null,
    })
    return respond(c, passkeyRegistrationOptionsResponseSchema, registration)
  })

  // Passkey registration (sign-up, recovery, or signed-in add) ------------

  app.post("/api/auth/passkeys/register", async (c) => {
    await limitByIp(c, "register")
    const body = await jsonBody(c, passkeyRegisterRequestSchema)
    const { store, webauthn, now, config } = deps(c)
    const auth = c.get("auth")
    // Adding a passkey to a signed-in account needs a fresh assertion with
    // an existing passkey, or any session could plant its own credential.
    if (auth !== null) requireStepUp(c)
    const pending = auth === null ? await readPendingState(c) : null
    if (
      auth === null &&
      (pending?.stage !== "passkey" ||
        pending.webauthnChallengeId !== body.challengeId)
    ) {
      throw new PlatformError("unauthorized")
    }
    const challenge = await consumeChallenge(c, body.challengeId, "register")
    const expectedAccountId =
      auth?.account.id ??
      (pending?.stage === "passkey" ? pending.accountId : null)
    if (
      challenge.accountId === null ||
      challenge.accountId !== expectedAccountId
    ) {
      throw new PlatformError("invalid_request", {
        message: "Challenge expired. Try again.",
      })
    }
    const account =
      auth?.account ?? (await store.getAccount(challenge.accountId))
    if (account === null || account.disabledAt !== null) {
      throw new PlatformError("unauthorized")
    }
    const verified = await verifyRegistration({
      config: webauthn,
      credential: body.credential,
      expectedChallenge: challenge.challenge,
    })
    if (verified === null) {
      throw new PlatformError("invalid_request", {
        message: "Passkey could not be verified.",
      })
    }
    const previousPasskeys = await store.listPasskeys(account.id)
    const flow = registrationFlow(
      auth !== null,
      pending?.stage === "passkey" ? pending.flow : null,
      previousPasskeys.length,
    )
    const registeredAt = now()
    let passkey: Awaited<ReturnType<typeof store.createPasskey>>
    try {
      passkey = await store.createPasskey({
        accountId: account.id,
        credentialId: verified.credentialId,
        publicKey: verified.publicKey,
        counter: verified.counter,
        transports: verified.transports,
        deviceType: verified.deviceType,
        backedUp: verified.backedUp,
        name: body.name ?? null,
        lastUsedAt: registeredAt.toISOString(),
        // Email recovery must not yield step-up with the new passkey.
        stepUpBlockedUntil:
          flow === "recovery"
            ? new Date(
                registeredAt.getTime() + recoveryStepUpBlockMs,
              ).toISOString()
            : null,
      })
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error
      throw new PlatformError("conflict", {
        message: "Passkey already registered.",
      })
    }
    await audit(c, {
      action: "passkey-registered",
      targetType: "passkey",
      targetId: passkey.id,
      metadata: { deviceType: passkey.deviceType, flow },
      actorId: account.id,
    })
    const accountUrl = `${config.consoleOrigin}/account`
    if (flow === "add") {
      await notifyAccount(
        c,
        account,
        passkeyChangedEmail({
          change: "added",
          passkeyName: passkey.name,
          at: passkey.createdAt,
          accountUrl,
        }),
      )
    }

    if (auth === null && pending?.stage === "passkey") {
      clearPendingState(c)
      if (flow === "sign-up") {
        const invitation =
          pending.invitationToken === null
            ? null
            : await acceptInvitation(c, account, pending.invitationToken)
        const organizations = await store.listOrganizationsForAccount(
          account.id,
        )
        if (invitation?.ok !== true && organizations.length === 0) {
          await createOrganizationWithOwner(c, account, {
            name: body.organizationName ?? account.displayName,
          })
        }
      } else {
        await audit(c, {
          action: "developer-recovery-completed",
          targetType: "account",
          targetId: account.id,
          actorId: account.id,
          metadata: {
            passkeyId: passkey.id,
            stepUpBlockedUntil: passkey.stepUpBlockedUntil,
          },
        })
        await notifyAccount(
          c,
          account,
          accountRecoveredEmail({ at: passkey.createdAt, accountUrl }),
        )
      }
      // Recovery sessions are never stepped up.
      const session = await startSession(c, account, {
        steppedUp: flow === "sign-up" && verified.userVerified,
      })
      await audit(c, {
        action: "developer-signed-in",
        targetType: "session",
        targetId: session.id,
        metadata: { method: flow },
      })
    }
    return respond(c, meResponseSchema, await buildMe(c, requireAuth(c)))
  })

  // Sign-in ---------------------------------------------------------------

  app.post("/api/auth/passkeys/authenticate/options", async (c) => {
    await limitByIp(c, "sign-in")
    return respond(
      c,
      passkeyAuthenticationOptionsResponseSchema,
      await authenticationChallenge(c, "authenticate", null),
    )
  })

  app.post("/api/auth/passkeys/authenticate", async (c) => {
    await limitByIp(c, "sign-in")
    const body = await jsonBody(c, passkeyAuthenticateRequestSchema)
    const { store, webauthn, now } = deps(c)
    const challenge = await consumeChallenge(
      c,
      body.challengeId,
      "authenticate",
    )
    const passkey = await store.findPasskeyByCredentialId(body.credential.id)
    if (passkey === null) throw passkeyFailed()
    const account = await store.getAccount(passkey.accountId)
    if (account === null || account.disabledAt !== null) throw passkeyFailed()
    const verified = await verifyAuthentication({
      config: webauthn,
      credential: body.credential,
      expectedChallenge: challenge.challenge,
      passkey,
      requireUserVerification: false,
    })
    if (verified === null) throw passkeyFailed()
    const signedInAt = now()
    await store.updatePasskey(passkey.id, {
      counter: verified.newCounter,
      backedUp: verified.backedUp,
      lastUsedAt: signedInAt.toISOString(),
    })
    // Only a user-verified assertion with a passkey that may step up yields
    // a stepped-up session (recovery passkeys wait 24 h).
    const session = await startSession(c, account, {
      steppedUp: verified.userVerified && passkeyMayStepUp(passkey, signedInAt),
    })
    await audit(c, {
      action: "developer-signed-in",
      targetType: "session",
      targetId: session.id,
      metadata: { method: "passkey", passkeyId: passkey.id },
    })
    return respond(c, meResponseSchema, await buildMe(c, requireAuth(c)))
  })

  // Step-up ---------------------------------------------------------------

  app.post("/api/auth/step-up/options", async (c) => {
    const auth = requireAuth(c)
    return respond(
      c,
      passkeyAuthenticationOptionsResponseSchema,
      await authenticationChallenge(c, "step-up", auth.account),
    )
  })

  app.post("/api/auth/step-up/verify", async (c) => {
    const auth = requireAuth(c)
    const body = await jsonBody(c, passkeyAuthenticateRequestSchema)
    const { store, webauthn, now } = deps(c)
    const challenge = await consumeChallenge(c, body.challengeId, "step-up")
    if (challenge.accountId !== auth.account.id) throw passkeyFailed()
    const passkey = await store.findPasskeyByCredentialId(body.credential.id)
    if (passkey === null || passkey.accountId !== auth.account.id) {
      throw passkeyFailed()
    }
    const at = now()
    if (!passkeyMayStepUp(passkey, at)) throw recoveryPasskeyBlocked()
    const verified = await verifyAuthentication({
      config: webauthn,
      credential: body.credential,
      expectedChallenge: challenge.challenge,
      passkey,
      requireUserVerification: true,
    })
    if (verified === null || !verified.userVerified) throw passkeyFailed()
    await store.updatePasskey(passkey.id, {
      counter: verified.newCounter,
      backedUp: verified.backedUp,
      lastUsedAt: at.toISOString(),
    })
    await store.updateSession(auth.session.id, {
      steppedUpAt: at.toISOString(),
    })
    await audit(c, {
      action: "developer-step-up-completed",
      targetType: "session",
      targetId: auth.session.id,
      metadata: { passkeyId: passkey.id },
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
    clearPendingState(c)
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
