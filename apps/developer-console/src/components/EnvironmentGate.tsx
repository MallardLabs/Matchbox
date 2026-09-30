import type { Environment } from "@repo/platform-contracts/console"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import * as Button from "@repo/ui/button"
import * as EmptyState from "@repo/ui/empty-state"
import * as Skeleton from "@repo/ui/skeleton"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ReactElement } from "react"
import * as api from "../lib/api"
import { errorMessage, isApiError } from "../lib/api-client"
import { environmentQuery, keys } from "../lib/queries"
import QueryError from "./QueryError"

type EnvironmentGateProps = {
  appId: string
  kind: EnvironmentKind
  children: (environment: Environment) => ReactElement
}

/** Loads one environment; offers to create it when missing. */
export default function EnvironmentGate({
  appId,
  kind,
  children,
}: EnvironmentGateProps): ReactElement {
  const environment = useQuery(environmentQuery(appId, kind))
  const queryClient = useQueryClient()
  const { toast } = Toast.useToast()
  const create = useMutation({
    mutationFn: () => api.apps.createEnvironment(appId, kind),
    async onSuccess(created) {
      queryClient.setQueryData(keys.environment(appId, kind), created)
      await queryClient.invalidateQueries({ queryKey: keys.app(appId) })
      toast({
        title: `${kind === "live" ? "Live" : "Test"} environment created`,
      })
    },
  })

  if (environment.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton.Root className="h-4 w-40" />
        <Skeleton.Root shape="block" />
        <Skeleton.Root shape="block" />
        <Skeleton.Root shape="block" className="h-24" />
      </div>
    )
  }
  if (environment.isError) {
    if (isApiError(environment.error, "not_found")) {
      return (
        <EmptyState.Root>
          <EmptyState.Title>
            {kind === "live" ? "No live environment" : "No test environment"}
          </EmptyState.Title>
          <EmptyState.Action>
            <Button.Root
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              {kind === "live"
                ? "Create live environment"
                : "Create test environment"}
            </Button.Root>
          </EmptyState.Action>
          {create.isError ? (
            <p role="alert" className="w-full text-[12px] font-500 text-neg">
              {errorMessage(create.error)}
            </p>
          ) : null}
        </EmptyState.Root>
      )
    }
    return (
      <QueryError
        error={environment.error}
        onRetry={() => void environment.refetch()}
      />
    )
  }
  return children(environment.data)
}
