import type {
  AppStatus,
  CredentialStatus,
  ReviewRecordState,
  ReviewState,
} from "@repo/platform-contracts/console"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import * as Badge from "@repo/ui/badge"
import type { ReactElement } from "react"
import { humanize } from "../lib/format"

type Tone = "neutral" | "accent" | "pos" | "warn" | "neg"

const reviewTones: Record<ReviewState | ReviewRecordState, Tone> = {
  development: "neutral",
  submitted: "warn",
  open: "warn",
  approved: "pos",
  "changes-requested": "warn",
  rejected: "neg",
  withdrawn: "neutral",
}

const reviewLabels: Record<ReviewState | ReviewRecordState, string> = {
  development: "Development",
  submitted: "In review",
  open: "Open",
  approved: "Approved",
  "changes-requested": "Changes requested",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
}

export function ReviewBadge({
  state,
}: {
  state: ReviewState | ReviewRecordState
}): ReactElement {
  return (
    <Badge.Root tone={reviewTones[state]} dot>
      {reviewLabels[state]}
    </Badge.Root>
  )
}

const appTones: Record<AppStatus, Tone> = {
  active: "pos",
  restricted: "warn",
  suspended: "neg",
  retired: "neutral",
}

export function AppStatusBadge({
  status,
}: { status: AppStatus }): ReactElement {
  return (
    <Badge.Root tone={appTones[status]} dot>
      {humanize(status)}
    </Badge.Root>
  )
}

const credentialTones: Record<CredentialStatus, Tone> = {
  active: "pos",
  expired: "neutral",
  revoked: "neg",
}

export function CredentialBadge({
  status,
}: {
  status: CredentialStatus
}): ReactElement {
  return (
    <Badge.Root tone={credentialTones[status]} dot>
      {humanize(status)}
    </Badge.Root>
  )
}

export function EnvBadge({ kind }: { kind: EnvironmentKind }): ReactElement {
  return (
    <Badge.Root tone={kind === "live" ? "accent" : "neutral"}>
      {kind === "live" ? "Live" : "Test"}
    </Badge.Root>
  )
}
