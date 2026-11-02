import { normalizeScopes } from "@repo/platform-contracts/scopes"
import { PlatformError } from "@repo/platform-server"
import { type ConsoleContext, deps } from "./context"
import type {
  AppProfilePatch,
  AppRecord,
  EnvironmentRecord,
} from "./store/console-store"

/**
 * Staff verification (`verifiedAt`), the Matchbox ID consent "Verified"
 * badge. Only a staff approval sets it (auto-approval never does), and it
 * vouches for what the reviewer saw: the app's consent profile and the
 * environment's requested scopes, redirect URIs and origins. Changing any
 * of those, or the app's status, withdraws it; none of them can change
 * while a live review is open, so an approval never covers an attribute
 * added after the reviewer looked.
 *
 * Once the decision closes the review those attributes unfreeze, so the two
 * sides check each other: a change withdraws verification again after it is
 * written, and the decision re-reads `verificationSubject` after writing
 * `verifiedAt` and withdraws it if anything moved. Every interleaving ends
 * unverified when a reviewed attribute changed.
 */

/** App fields the consent screen shows. */
const consentProfileFields = [
  "name",
  "logoUrl",
  "websiteUrl",
  "privacyUrl",
  "termsUrl",
] as const satisfies readonly (keyof AppProfilePatch & keyof AppRecord)[]

export function consentProfileChanged(
  app: AppRecord,
  patch: AppProfilePatch,
): boolean {
  return consentProfileFields.some(
    (field) => patch[field] !== undefined && patch[field] !== app[field],
  )
}

/**
 * Everything a staff verification vouches for, as one comparable string;
 * null when the app or environment is gone.
 */
export async function verificationSubject(
  c: ConsoleContext,
  appId: string,
  environmentId: string,
): Promise<string | null> {
  const { store } = deps(c)
  const [app, environment, redirectUris, origins] = await Promise.all([
    store.getApp(appId),
    store.getEnvironment(environmentId),
    store.listRedirectUris(environmentId),
    store.listOrigins(environmentId),
  ])
  if (app === null || environment === null) return null
  return JSON.stringify({
    profile: consentProfileFields.map((field) => app[field]),
    status: app.status,
    requestedScopes: normalizeScopes(environment.requestedScopes),
    redirectUris: [...redirectUris].sort(),
    origins: [...origins].sort(),
  })
}

/** 409 while the environment has an open live review. */
export async function assertNoOpenLiveReview(
  c: ConsoleContext,
  environment: EnvironmentRecord,
  subject: string,
): Promise<void> {
  if (environment.kind !== "live") return
  if ((await deps(c).store.getOpenReview(environment.id)) === null) return
  throw new PlatformError("conflict", {
    message: `Withdraw the open review before changing ${subject}.`,
  })
}

/** Withdraws the environment's verification; returns it as stored. */
export async function withdrawVerification(
  c: ConsoleContext,
  environment: EnvironmentRecord,
): Promise<EnvironmentRecord> {
  if (environment.verifiedAt === null) return environment
  return deps(c).store.updateEnvironment(environment.id, { verifiedAt: null })
}

/** Re-reads the environment and withdraws its verification. */
export async function withdrawCurrentVerification(
  c: ConsoleContext,
  environmentId: string,
): Promise<EnvironmentRecord | null> {
  const environment = await deps(c).store.getEnvironment(environmentId)
  return environment === null ? null : withdrawVerification(c, environment)
}

/** Withdraws the verification of every environment of the app. */
export async function withdrawAppVerification(
  c: ConsoleContext,
  appId: string,
): Promise<void> {
  const { store } = deps(c)
  for (const environment of await store.listEnvironmentsForApps([appId])) {
    await withdrawVerification(c, environment)
  }
}
