import { useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import type { IdentityAccountView } from "../../shared/contracts"
import { useSession } from "./queries"

/** The signed-in account; sends signed-out visitors to /sign-in. */
export function useRequiredAccount(
  returnTo: string,
): IdentityAccountView | null {
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
