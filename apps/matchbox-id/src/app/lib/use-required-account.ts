import type { IdentityAccount } from "@repo/platform-contracts/identity"
import { useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { useSession } from "./queries"

/** The signed-in account; sends signed-out visitors to /sign-in. */
export function useRequiredAccount(returnTo: string): IdentityAccount | null {
  const session = useSession()
  const navigate = useNavigate()
  const account = session.data?.account ?? null
  const signedOut = session.isSuccess && session.data.account === null
  useEffect(() => {
    if (signedOut) {
      void navigate({
        to: "/sign-in",
        search: { return: returnTo },
        replace: true,
      })
    }
  }, [navigate, returnTo, signedOut])
  return account
}
