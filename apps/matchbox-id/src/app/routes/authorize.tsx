import { chainIdByNetwork } from "@repo/platform-contracts/network"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { type ReactElement, useEffect, useRef } from "react"
import ConsentView, { type ConsentDecision } from "../components/ConsentView"
import ErrorState from "../components/ErrorState"
import PageSkeleton from "../components/PageSkeleton"
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

function Redirecting(): ReactElement {
  return (
    <output className="block py-10 text-[14px] font-500 text-secondary">
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

  function decide(choice: ConsentDecision): void {
    decision.mutate(
      { decision: choice },
      { onSuccess: ({ redirectTo }) => window.location.replace(redirectTo) },
    )
  }

  const skipConsent =
    detail.data !== undefined && !detail.data.consentRequired && !reauthenticate

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
  if (account === null || detail.data === undefined || reauthenticate) {
    return <PageSkeleton />
  }
  if (skipConsent || decision.isSuccess) return <Redirecting />

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col py-2 sm:py-8">
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
    </div>
  )
}
