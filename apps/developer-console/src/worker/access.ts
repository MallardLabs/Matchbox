import type {
  MembershipRole,
  StaffRole,
} from "@repo/platform-contracts/console"
import { PlatformError } from "@repo/platform-server"
import {
  type AuthContext,
  type ConsoleContext,
  deps,
  requireAuth,
} from "./context"
import type {
  AppRecord,
  EnvironmentRecord,
  MembershipRecord,
  OrganizationRecord,
} from "./store/console-store"

/**
 * Organization roles, lowest to highest:
 * - developer: view org, apps, environments, keys, usage; manage test keys
 * - admin: manage apps, environments, live keys, client secrets, members
 *   and invitations (never owners)
 * - owner: everything, incl. org deletion and ownership changes
 *
 * Non-members get 404 so ids do not leak; members below the required role
 * get 403.
 */
const roleRank = {
  developer: 1,
  admin: 2,
  owner: 3,
} as const satisfies Record<MembershipRole, number>

export function roleAtLeast(role: MembershipRole, minimum: MembershipRole) {
  return roleRank[role] >= roleRank[minimum]
}

export type OrganizationAccess = AuthContext & {
  organization: OrganizationRecord
  membership: MembershipRecord
}

export type AppAccess = OrganizationAccess & { app: AppRecord }

export type EnvironmentAccess = AppAccess & { environment: EnvironmentRecord }

function checkRole(membership: MembershipRecord, minimum: MembershipRole) {
  if (!roleAtLeast(membership.role, minimum)) {
    throw new PlatformError("forbidden", {
      message: `Requires the ${minimum} role.`,
    })
  }
}

export async function organizationAccess(
  c: ConsoleContext,
  organizationId: string,
  minimum: MembershipRole,
): Promise<OrganizationAccess> {
  const auth = requireAuth(c)
  const { store } = deps(c)
  const [organization, membership] = await Promise.all([
    store.getOrganization(organizationId),
    store.getMembership(organizationId, auth.account.id),
  ])
  if (organization === null || membership === null) {
    throw new PlatformError("not_found")
  }
  checkRole(membership, minimum)
  return { ...auth, organization, membership }
}

export async function appAccess(
  c: ConsoleContext,
  appId: string,
  minimum: MembershipRole,
): Promise<AppAccess> {
  const app = await deps(c).store.getApp(appId)
  if (app === null) {
    requireAuth(c)
    throw new PlatformError("not_found")
  }
  const access = await organizationAccess(c, app.organizationId, minimum)
  return { ...access, app }
}

export async function environmentAccess(
  c: ConsoleContext,
  environmentId: string,
  minimum:
    | MembershipRole
    | ((environment: EnvironmentRecord) => MembershipRole),
): Promise<EnvironmentAccess> {
  requireAuth(c)
  const environment = await deps(c).store.getEnvironment(environmentId)
  if (environment === null) throw new PlatformError("not_found")
  const required =
    typeof minimum === "function" ? minimum(environment) : minimum
  const access = await appAccess(c, environment.appId, required)
  return { ...access, environment }
}

/** Test credentials: developers; live credentials: admins. */
export function credentialRole(environment: EnvironmentRecord): MembershipRole {
  return environment.kind === "live" ? "admin" : "developer"
}

/** Retired apps are read-only. */
export function assertAppWritable(app: AppRecord): void {
  if (app.status === "retired") {
    throw new PlatformError("conflict", { message: "The app is retired." })
  }
}

/**
 * Staff roles, lowest to highest:
 * - reviewer: read the review queue, apps and audit log; decide reviews
 * - operator: additionally change app status and manage quota overrides
 */
const staffRank = {
  reviewer: 1,
  operator: 2,
} as const satisfies Record<StaffRole, number>

/** 403 unless the account is staff with at least `minimum`. */
export async function requireStaff(
  c: ConsoleContext,
  minimum: StaffRole,
): Promise<AuthContext & { staffRole: StaffRole }> {
  const auth = requireAuth(c)
  const staffRole = await deps(c).store.getStaffRole(auth.account.id)
  if (staffRole === null) throw new PlatformError("forbidden")
  if (staffRank[staffRole] < staffRank[minimum]) {
    throw new PlatformError("forbidden", {
      message: `Requires the ${minimum} staff role.`,
    })
  }
  return { ...auth, staffRole }
}
