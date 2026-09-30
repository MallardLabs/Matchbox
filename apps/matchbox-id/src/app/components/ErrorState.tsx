import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import * as PageHeader from "@repo/ui/page-header"
import { Link } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { usePageTitle } from "../lib/page-title"

const titles: Record<string, string> = {
  invalid_client: "Unknown app",
  invalid_redirect_uri: "Redirect not registered",
  invalid_request: "Invalid request",
  invalid_scope: "Invalid scope",
  unsupported_response_type: "Unsupported request",
  access_denied: "Access denied",
  login_required: "Sign-in required",
  consent_required: "Consent required",
  request_expired: "Request expired",
  service_disabled: "Matchbox ID unavailable",
  temporarily_unavailable: "Temporarily unavailable",
  server_error: "Something went wrong",
  not_found: "Not found",
}

export function errorTitle(code: string): string {
  return titles[code] ?? "Sign-in error"
}

/** Terse error page: title, the machine code as a chip, one way out. */
export default function ErrorState({ code }: { code: string }): ReactElement {
  const title = errorTitle(code)
  usePageTitle(title)
  return (
    <section className="flex flex-col items-start gap-5 py-10">
      <PageHeader.Root>
        <PageHeader.Heading>
          <PageHeader.Title>{title}</PageHeader.Title>
        </PageHeader.Heading>
      </PageHeader.Root>
      <Badge.Root mono tone="neutral">
        {code}
      </Badge.Root>
      {code === "service_disabled" ? null : (
        <Button.Root asChild variant="secondary">
          <Link to="/">Account</Link>
        </Button.Root>
      )}
    </section>
  )
}
