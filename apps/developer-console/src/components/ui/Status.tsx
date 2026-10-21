import type {
  AppStatus,
  CredentialStatus,
  ReviewRecordState,
  ReviewState,
} from "@repo/platform-contracts/console"
import { cn } from "@repo/ui/cn"
import type { ReactElement, ReactNode } from "react"

export type StatusTone = "pos" | "warn" | "neg" | "neutral"

const dotClass: Record<StatusTone, string> = {
  pos: "bg-pos",
  warn: "bg-accent",
  neg: "bg-neg",
  neutral: "bg-faint",
}

const textClass: Record<StatusTone, string> = {
  pos: "text-pos",
  warn: "text-accent-ink",
  neg: "text-neg",
  neutral: "text-secondary",
}

/** State = dot + label (design note 3); never colour alone. */
export function StatusLabel({
  tone,
  size = "sm",
  className,
  children,
}: {
  tone: StatusTone
  /** xs 11px (history rows), sm 12px (tables), md 14px (status strip). */
  size?: "xs" | "sm" | "md"
  className?: string | undefined
  children: ReactNode
}): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap font-600",
        size === "md"
          ? "text-body"
          : size === "xs"
            ? "text-caption"
            : "text-label",
        textClass[tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", dotClass[tone])}
      />
      {children}
    </span>
  )
}

export function StatusDot({
  tone,
  className,
}: {
  tone: StatusTone
  className?: string | undefined
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        dotClass[tone],
        className,
      )}
    />
  )
}

type ReviewLike = ReviewState | ReviewRecordState

export const reviewTones: Record<ReviewLike, StatusTone> = {
  development: "neutral",
  submitted: "warn",
  open: "warn",
  approved: "pos",
  "changes-requested": "warn",
  rejected: "neg",
  withdrawn: "neutral",
}

export const reviewLabels: Record<ReviewLike, string> = {
  development: "Development",
  submitted: "In review",
  open: "Open",
  approved: "Approved",
  "changes-requested": "Changes requested",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
}

export function ReviewStatus({
  state,
  className,
}: {
  state: ReviewLike
  className?: string | undefined
}): ReactElement {
  return (
    <StatusLabel tone={reviewTones[state]} className={className}>
      {reviewLabels[state]}
    </StatusLabel>
  )
}

const credentialTones: Record<CredentialStatus, StatusTone> = {
  active: "pos",
  expired: "neutral",
  revoked: "neg",
}

const credentialLabels: Record<CredentialStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
}

export function CredentialStatusLabel({
  status,
}: {
  status: CredentialStatus
}): ReactElement {
  return (
    <StatusLabel tone={credentialTones[status]}>
      {credentialLabels[status]}
    </StatusLabel>
  )
}

const appTones: Record<AppStatus, StatusTone> = {
  active: "pos",
  restricted: "warn",
  suspended: "neg",
  retired: "neutral",
}

const appLabels: Record<AppStatus, string> = {
  active: "Active",
  restricted: "Restricted",
  suspended: "Suspended",
  retired: "Retired",
}

export function AppStatusLabel({
  status,
  className,
}: {
  status: AppStatus
  className?: string | undefined
}): ReactElement {
  return (
    <StatusLabel tone={appTones[status]} className={className}>
      {appLabels[status]}
    </StatusLabel>
  )
}
