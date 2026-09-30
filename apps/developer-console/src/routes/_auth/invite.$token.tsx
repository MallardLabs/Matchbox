import * as Button from "@repo/ui/button"
import * as Skeleton from "@repo/ui/skeleton"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import type { ReactElement } from "react"
import AuthHeading from "../../components/auth/AuthHeading"
import * as api from "../../lib/api"
import { errorMessage, isApiError } from "../../lib/api-client"
import { keys, meQuery } from "../../lib/queries"
import { rememberOrganization } from "../../lib/session"
import { useTitle } from "../../lib/title"

export const Route = createFileRoute("/_auth/invite/$token")({
  component: InvitePage,
})

function InvitePage(): ReactElement {
  useTitle("Invitation")
  const { token } = Route.useParams()
  const me = useQuery({ ...meQuery, retry: false })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { toast } = Toast.useToast()
  const accept = useMutation({
    mutationFn: () => api.orgs.acceptInvitation(token),
    async onSuccess(organization) {
      rememberOrganization(organization.id)
      await queryClient.invalidateQueries({ queryKey: keys.me })
      toast({ title: `Joined ${organization.name}` })
      await navigate({ to: "/organization" })
    },
  })

  if (me.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton.Root className="h-8 w-40" />
        <Skeleton.Root shape="block" className="h-10" />
      </div>
    )
  }

  const signedOut = me.isError && isApiError(me.error, "unauthorized")
  const invitePath = `/invite/${encodeURIComponent(token)}`

  return (
    <>
      <AuthHeading title="Invitation" />
      {signedOut || me.isError ? (
        <div className="flex flex-col gap-3">
          <Button.Root size="lg" asChild>
            <Link to="/sign-up" search={{ invitation: token }}>
              Create account
            </Link>
          </Button.Root>
          <Button.Root size="lg" variant="secondary" asChild>
            <Link to="/sign-in" search={{ redirect: invitePath }}>
              Sign in
            </Link>
          </Button.Root>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-secondary">{me.data.account.email}</p>
          <Button.Root
            size="lg"
            loading={accept.isPending}
            onClick={() => accept.mutate()}
          >
            Accept invitation
          </Button.Root>
          {accept.isError ? (
            <p role="alert" className="text-[12px] font-500 text-neg">
              {errorMessage(accept.error)}
            </p>
          ) : null}
        </div>
      )}
    </>
  )
}
