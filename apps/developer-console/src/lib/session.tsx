import type {
  MeResponse,
  OrganizationSummary,
} from "@repo/platform-contracts/console"
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

const storageKey = "matchbox-developers:org"

function readStoredOrg(): string | null {
  try {
    return window.localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

export function rememberOrganization(orgId: string): void {
  try {
    window.localStorage.setItem(storageKey, orgId)
  } catch {
    // Storage may be unavailable; selection then lasts for the tab only.
  }
}

type SessionValue = {
  me: MeResponse
  /** Selected organization; null when the account has none. */
  org: OrganizationSummary | null
  selectOrg: (orgId: string) => void
}

const SessionContext = createContext<SessionValue | null>(null)

export function pickOrganization(
  organizations: OrganizationSummary[],
  preferredId: string | null,
): OrganizationSummary | null {
  return (
    organizations.find((org) => org.id === preferredId) ??
    organizations[0] ??
    null
  )
}

export function SessionProvider({
  me,
  children,
}: {
  me: MeResponse
  children: ReactNode
}): ReactElement {
  const [preferred, setPreferred] = useState<string | null>(readStoredOrg)
  const selectOrg = useCallback((orgId: string) => {
    rememberOrganization(orgId)
    setPreferred(orgId)
  }, [])
  const org = pickOrganization(me.organizations, preferred)
  const value = useMemo(() => ({ me, org, selectOrg }), [me, org, selectOrg])
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (value === null) throw new Error("useSession outside <SessionProvider>")
  return value
}

/** The session when signed in; null on public pages (docs). */
export function useOptionalSession(): SessionValue | null {
  return useContext(SessionContext)
}

export function canManage(org: OrganizationSummary | null): boolean {
  return org !== null && (org.role === "owner" || org.role === "admin")
}
