import type { MeResponse } from "@repo/platform-contracts/console"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"
import { meQuery } from "../../lib/queries"

/** Only same-app paths are followed after sign-in. */
export function safeRedirect(value: string | undefined): string {
  if (value === undefined) return "/"
  return value.startsWith("/") && !value.startsWith("//") ? value : "/"
}

/** Seeds the session cache and leaves the auth screens. */
export default function useCompleteSignIn(
  redirect?: string,
): (me: MeResponse) => Promise<void> {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useCallback(
    async (me: MeResponse) => {
      queryClient.clear()
      queryClient.setQueryData(meQuery.queryKey, me)
      await navigate({ to: safeRedirect(redirect), replace: true })
    },
    [navigate, queryClient, redirect],
  )
}
