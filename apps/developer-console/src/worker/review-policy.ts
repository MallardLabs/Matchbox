import type { ReviewState } from "@repo/platform-contracts/console"
import {
  type PlatformScope,
  diffScopes,
  normalizeScopes,
  scopeRequiresReview,
} from "@repo/platform-contracts/scopes"
import type { AppRecord, EnvironmentRecord } from "./store/console-store"

/**
 * Review rules (ARCHITECTURE §8):
 * - live: auto-approve when only `gauge-profiles:read` is requested, an org
 *   owner has a verified email, the app has a website URL and is active;
 * - test: auto-approve unless a newly requested scope requires review
 *   (`discord:*`);
 * - everything else opens a manual review. Approved scopes keep working
 *   while a review for more scopes is open, so an environment with approved
 *   scopes stays `approved`.
 */

export const autoApprovableLiveScopes: readonly PlatformScope[] = [
  "gauge-profiles:read",
]

export type SubmissionEvaluation = {
  added: PlatformScope[]
  autoApprove: boolean
}

export function evaluateSubmission(input: {
  environment: Pick<
    EnvironmentRecord,
    "kind" | "requestedScopes" | "approvedScopes"
  >
  app: Pick<AppRecord, "status" | "websiteUrl">
  ownerEmailVerified: boolean
}): SubmissionEvaluation {
  const { environment } = input
  const added = diffScopes(
    environment.approvedScopes,
    environment.requestedScopes,
  ).added
  if (environment.kind === "test") {
    return {
      added,
      autoApprove: !added.some((scope) => scopeRequiresReview(scope)),
    }
  }
  return {
    added,
    autoApprove:
      environment.requestedScopes.length > 0 &&
      environment.requestedScopes.every((scope) =>
        autoApprovableLiveScopes.includes(scope),
      ) &&
      input.ownerEmailVerified &&
      input.app.websiteUrl !== null &&
      input.app.status === "active",
  }
}

/** Review state an environment shows given its approved scopes. */
export function environmentReviewState(
  approvedScopes: readonly PlatformScope[],
  otherwise: ReviewState,
): ReviewState {
  return approvedScopes.length > 0 ? "approved" : otherwise
}

/**
 * Approved scopes after an approval: the reviewed set, limited to what is
 * still requested. The scope version bumps when any scope is new, which
 * forces re-consent for existing grants.
 */
export function approvalOutcome(input: {
  environment: Pick<
    EnvironmentRecord,
    "requestedScopes" | "approvedScopes" | "scopeVersion"
  >
  approve: readonly PlatformScope[]
}): {
  approvedScopes: PlatformScope[]
  scopeVersion: number
  added: PlatformScope[]
} {
  const requested = new Set(input.environment.requestedScopes)
  const approvedScopes = normalizeScopes([
    ...input.environment.approvedScopes.filter((scope) => requested.has(scope)),
    ...input.approve.filter((scope) => requested.has(scope)),
  ])
  const added = diffScopes(
    input.environment.approvedScopes,
    approvedScopes,
  ).added
  return {
    approvedScopes,
    scopeVersion:
      added.length > 0
        ? input.environment.scopeVersion + 1
        : input.environment.scopeVersion,
    added,
  }
}
