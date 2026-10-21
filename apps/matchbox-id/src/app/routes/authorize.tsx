import { chainIdByNetwork } from "@repo/platform-contracts/network"
import type { OidcScope } from "@repo/platform-contracts/scopes"
import * as Skeleton from "@repo/ui/skeleton"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { type ReactElement, type ReactNode, useEffect, useRef } from "react"
import ConsentView, { type ConsentDecision } from "../components/ConsentView"
import ErrorState from "../components/ErrorState"
import { isApiError } from "../lib/api"
import { usePageTitle } from "../lib/page-title"
import {
  useAuthorizationRequest,
  useDecision,
  useSession,
} from "../lib/queries"
import { authorizeSearchSchema } from "../lib/search"

export const Route = createFileRoute("/authorize")({
  validateSearch: authorizeSearchSchema,
  component: AuthorizePage,
})

function Ground({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="flex flex-1 justify-center md:items-center md:px-6 md:py-12">
      {children}
    </div>
  )
}

function CardSkeleton(): ReactElement {
  return (
    <div
      aria-busy="true"
      className="flex w-full flex-col gap-4 bg-surface p-4 md:max-w-[480px] md:rounded-xl md:border md:border-line md:p-5"
    >
      <output className="sr-only">Loading</output>
      <div className="flex items-center gap-3.5">
        <Skeleton.Root className="size-12 rounded-[10px]" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton.Root className="h-5 w-40" />
          <Skeleton.Root className="w-56" />
        </div>
      </div>
      <Skeleton.Root shape="block" className="h-40" />
      <Skeleton.Root shape="block" className="h-11" />
    </div>
  )
}

function Redirecting(): ReactElement {
  return (
    <output className="flex flex-1 items-center justify-center py-10 text-body font-500 text-secondary">
      Redirecting…
    </output>
  )
}

function AuthorizePage(): ReactElement {
  usePageTitle("Authorize")
  const { request: requestId } = Route.useSearch()
  const navigate = useNavigate()
  const session = useSession()
  const account = session.data?.account ?? null
  const detail = useAuthorizationRequest(requestId, account !== null)
  const decision = useDecision(requestId)
  const autoApproved = useRef(false)
  const returnPath = `/authorize?request=${encodeURIComponent(requestId)}`

  const signedOut = session.isSuccess && account === null
  // "Sign in on <network>": the session's contract-account signature was
  // verified on another network, so sign a message for the client's chain.
  const signInChain =
    detail.data?.networkSignInRequired === true
      ? chainIdByNetwork[detail.data.network]
      : undefined
  const reauthenticate =
    detail.data?.reauthenticationRequired === true || signInChain !== undefined

  useEffect(() => {
    if (signedOut || reauthenticate) {
      void navigate({
        to: "/sign-in",
        search: {
          return: returnPath,
          force: reauthenticate,
          ...(signInChain === undefined ? {} : { chain: signInChain }),
        },
        replace: true,
      })
    }
  }, [navigate, reauthenticate, returnPath, signInChain, signedOut])

  function decide(choice: ConsentDecision, declinedScopes: OidcScope[]): void {
    decision.mutate(
      choice === "approve"
        ? { decision: choice, declinedScopes }
        : { decision: choice },
      { onSuccess: ({ redirectTo }) => window.location.replace(redirectTo) },
    )
  }

  const skipConsent =
    detail.data !== undefined && !detail.data.consentRequired && !reauthenticate

  // Covered by the existing grant: approve with its earlier choices.
  useEffect(() => {
    if (skipConsent && !autoApproved.current) {
      autoApproved.current = true
      decision.mutate(
        { decision: "approve" },
        { onSuccess: ({ redirectTo }) => window.location.replace(redirectTo) },
      )
    }
  }, [decision, skipConsent])

  if (requestId === "") return <ErrorState code="invalid_request" />
  if (detail.isError) {
    return (
      <ErrorState
        code={
          isApiError(detail.error, "not_found")
            ? "request_expired"
            : "server_error"
        }
      />
    )
  }
  if (skipConsent || decision.isSuccess) return <Redirecting />
  if (account === null || detail.data === undefined || reauthenticate) {
    return (
      <Ground>
        <CardSkeleton />
      </Ground>
    )
  }

  return (
    <Ground>
      <ConsentView
        request={detail.data}
        account={account}
        pending={
          decision.isPending ? (decision.variables?.decision ?? null) : null
        }
        error={
          decision.isError
            ? isApiError(decision.error, "not_found")
              ? "Request expired"
              : "Decision failed"
            : null
        }
        onDecision={decide}
        onSwitchAccount={() =>
          void navigate({
            to: "/sign-in",
            search: { return: returnPath, force: true },
          })
        }
      />
    </Ground>
  )
}
