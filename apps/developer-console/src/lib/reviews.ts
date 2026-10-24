import type {
  DeveloperReview,
  ReviewRecordState,
} from "@repo/platform-contracts/console"
import type { PlatformScope } from "@repo/platform-contracts/scopes"
import type { StatusTone } from "../components/ui/Status"

/** Developer-facing review states ("Open" reads "In review"). */
export const developerReviewLabels: Record<ReviewRecordState, string> = {
  open: "In review",
  approved: "Approved",
  "changes-requested": "Changes requested",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
}

export const developerReviewTones: Record<ReviewRecordState, StatusTone> = {
  open: "warn",
  approved: "pos",
  "changes-requested": "warn",
  rejected: "neg",
  withdrawn: "neutral",
}

/** "Auto-approved" for policy approvals, else the record state label. */
export function reviewOutcomeLabel(
  review: Pick<DeveloperReview, "state" | "decidedBy">,
): string {
  if (review.state === "approved" && review.decidedBy === "auto") {
    return "Auto-approved"
  }
  if (review.state === "open") return "Submitted"
  return developerReviewLabels[review.state]
}

/** Scopes a review adds on top of what the environment already has. */
export function addedScopes(
  requested: readonly PlatformScope[],
  approved: readonly PlatformScope[],
): PlatformScope[] {
  const added = requested.filter((scope) => !approved.includes(scope))
  return added.length > 0 ? added : [...requested]
}

/** A staff note the developer should read (not auto-approval text). */
export function visibleReviewerNote(
  review: Pick<DeveloperReview, "reviewerNote" | "decidedBy">,
): string | null {
  if (review.decidedBy !== "staff") return null
  const note = review.reviewerNote?.trim() ?? ""
  return note === "" ? null : note
}

export type ReviewEvent = {
  key: string
  at: string
  /** "discord:profile" or "gauge-profiles:read +2". */
  scopes: string
  label: string
  tone: StatusTone
}

export function scopeSummary(scopes: readonly string[]): string {
  const [first, ...rest] = scopes
  if (first === undefined) return "—"
  return rest.length === 0 ? first : `${first} +${rest.length}`
}

/**
 * Review timeline, newest first: each review contributes its submission
 * and, once closed, its decision. Auto-approvals are one event.
 */
export function reviewHistory(
  reviews: readonly Pick<
    DeveloperReview,
    "id" | "state" | "decidedBy" | "requestedScopes" | "createdAt" | "decidedAt"
  >[],
): ReviewEvent[] {
  const events: ReviewEvent[] = []
  for (const review of reviews) {
    const scopes = scopeSummary(review.requestedScopes)
    const auto = review.state === "approved" && review.decidedBy === "auto"
    if (!auto) {
      events.push({
        key: `${review.id}:submitted`,
        at: review.createdAt,
        scopes,
        label: "Submitted",
        tone: "neutral",
      })
    }
    if (review.state !== "open" && review.decidedAt !== null) {
      events.push({
        key: `${review.id}:decided`,
        at: review.decidedAt,
        scopes,
        label: reviewOutcomeLabel(review),
        tone: developerReviewTones[review.state],
      })
    }
  }
  return events.sort(
    (left, right) =>
      Date.parse(right.at) - Date.parse(left.at) ||
      (left.label === "Submitted" ? 1 : 0) -
        (right.label === "Submitted" ? 1 : 0),
  )
}
