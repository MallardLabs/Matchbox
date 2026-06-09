// Linking + semester-role primitives shared by the Matchbox edge functions:
// the signed-message format, random token/nonce generation, the Academy
// allocation lookup (rolling or fixed window), and the role reconciliation rule
// (a member holds a semester's role iff they survive the reward-floor cull).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getAddress } from "https://esm.sh/viem@2"
import { addGuildRole, removeGuildRole } from "./discord.ts"

// Concrete client type matching a default createClient(url, key) call. The bare
// SupabaseClient generic defaults to a `never` schema that isn't assignable from
// real usage, so we derive the type from the factory instead.
// biome-ignore lint/suspicious/noExplicitAny: untyped DB schema, matches supabase-js default
export type SupabaseClient = ReturnType<typeof createClient<any, "public">>

// Stored shape of a confirmed link (subset of discord_wallet_links).
export type DiscordWalletLink = {
  discord_user_id: string
  wallet_address: string
  guild_id: string | null
  granted_roles: string[]
}

// A semester window with a role to grant (role_id guaranteed present).
export type Semester = {
  semester_id: string
  label: string
  from_ts: number
  to_ts: number
  role_id: string
  // When true the reward-floor cull applies (Semester 0 behaviour).
  // When false any participation (pointsWad > 0) qualifies.
  require_floor: boolean
}

export type WindowRange = { from: number; to: number }

const TOKEN_TTL_SECONDS = 15 * 60

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

// Unguessable capability embedded in the link URL handed to the user.
export function randomToken(): string {
  return randomHex(32)
}

// Per-link nonce embedded in the signed message (binds the signature to this link).
export function randomNonce(): string {
  return randomHex(16)
}

export function linkTokenExpiry(nowMs: number): string {
  return new Date(nowMs + TOKEN_TTL_SECONDS * 1000).toISOString()
}

// The exact human-readable message the wallet signs. Deterministic given its
// inputs so the verifier can rebuild and compare it byte-for-byte.
export function buildLinkMessage(args: {
  domain: string
  discordUserId: string
  address: string
  nonce: string
  expiresAt: string
}): string {
  const checksummed = getAddress(args.address)
  return [
    `${args.domain} wants you to link your wallet to your Discord account.`,
    "",
    `Wallet: ${checksummed}`,
    `Discord User ID: ${args.discordUserId}`,
    `Nonce: ${args.nonce}`,
    `Expires: ${args.expiresAt}`,
    "",
    "Signing this message proves you own this wallet. It does not create a",
    "transaction or cost any gas.",
  ].join("\n")
}

// The message a wallet signs to unlink itself from Discord. Deterministic so the
// verifier can rebuild and compare it byte-for-byte.
export function buildUnlinkMessage(args: {
  domain: string
  address: string
}): string {
  const checksummed = getAddress(args.address)
  return [
    `${args.domain} wants you to unlink your wallet from your Discord account.`,
    "",
    `Wallet: ${checksummed}`,
    "",
    "Signing this message proves you own this wallet. It does not create a",
    "transaction or cost any gas.",
  ].join("\n")
}

function webappBaseUrl(): string {
  const baseUrl = Deno.env.get("MATCHBOX_WEBAPP_URL")
  if (!baseUrl) throw new Error("Missing MATCHBOX_WEBAPP_URL")
  return baseUrl.replace(/\/$/, "")
}

export type RoleQualification = {
  qualifies: boolean
  pointsWad: bigint
}

// Fetch a wallet's Academy role qualification from the webapp's on-demand actor
// API. Pass a range for a fixed semester window; omit it for the rolling
// last-8-epoch window. Throws on network/HTTP failure. A wallet qualifies only
// if its simulated reward survives the Academy reward floor/cull pass.
export async function fetchAcademyRoleQualification(
  address: string,
  range?: WindowRange,
): Promise<RoleQualification> {
  const network = Deno.env.get("ACADEMY_NETWORK") ?? "mainnet"
  let url = `${webappBaseUrl()}/api/academy/actor?actor=${address}&network=${network}`
  if (range) url += `&from=${range.from}&to=${range.to}`

  const res = await fetch(url, { headers: { Accept: "application/json" } })
  if (!res.ok) throw new Error(`Academy actor API returned ${res.status}`)
  const data = await res.json()
  if (data?.success !== true) throw new Error("Academy actor API failed")
  const row = data?.row
  const pointsWad =
    typeof row?.pointsWad === "string" ? BigInt(row.pointsWad) : 0n
  const rewardMezoWad =
    typeof row?.rewardMezoWad === "string" ? BigInt(row.rewardMezoWad) : 0n
  return {
    pointsWad,
    qualifies:
      pointsWad > 0n && rewardMezoWad > 0n && row?.culledBelowFloor !== true,
  }
}

// Fetch the set of wallets (lowercased) whose simulated reward survived the
// reward floor/cull pass in one leaderboard call. Used by the reconcile cron to
// avoid per-wallet fetches.
export async function fetchWindowQualifiers(
  range?: WindowRange,
): Promise<Set<string>> {
  const network = Deno.env.get("ACADEMY_NETWORK") ?? "mainnet"
  let url =
    `${webappBaseUrl()}/api/academy/leaderboard?network=${network}&qualifiedOnly=1`
  if (range) url += `&from=${range.from}&to=${range.to}`

  const res = await fetch(url, { headers: { Accept: "application/json" } })
  if (!res.ok) throw new Error(`Academy leaderboard API returned ${res.status}`)
  const data = await res.json()
  if (data?.success !== true) throw new Error("Academy leaderboard API failed")
  const set = new Set<string>()
  for (const row of data.rows ?? []) {
    if (typeof row?.actor === "string") {
      set.add(String(row.actor).toLowerCase())
    }
  }
  return set
}

// Fetch the set of wallets (lowercased) that have ANY points in a window,
// regardless of the reward floor. Used for no-floor semesters (Semester 1+).
export async function fetchWindowParticipants(
  range?: WindowRange,
): Promise<Set<string>> {
  const network = Deno.env.get("ACADEMY_NETWORK") ?? "mainnet"
  let url = `${webappBaseUrl()}/api/academy/leaderboard?network=${network}`
  if (range) url += `&from=${range.from}&to=${range.to}`

  const res = await fetch(url, { headers: { Accept: "application/json" } })
  if (!res.ok) throw new Error(`Academy leaderboard API returned ${res.status}`)
  const data = await res.json()
  if (data?.success !== true) throw new Error("Academy leaderboard API failed")
  const set = new Set<string>()
  for (const row of data.rows ?? []) {
    if (typeof row?.actor === "string") {
      set.add(String(row.actor).toLowerCase())
    }
  }
  return set
}

// 1 point = 1e18 WAD. Used for display.
export function pointsFromWad(pointsWad: bigint): number {
  return Number(pointsWad / 10n ** 14n) / 10_000
}

// Load active semesters that have a role configured.
export async function getActiveSemesters(
  supabase: SupabaseClient,
): Promise<Semester[]> {
  const { data } = await supabase
    .from("discord_semesters")
    .select("semester_id, label, from_ts, to_ts, role_id, require_floor")
    .eq("active", true)
    .not("role_id", "is", null)
    .order("from_ts", { ascending: true })
  if (!data) return []
  return data.map((r: Semester) => ({
    semester_id: r.semester_id,
    label: r.label,
    from_ts: Number(r.from_ts),
    to_ts: Number(r.to_ts),
    role_id: r.role_id,
    require_floor: r.require_floor ?? true,
  }))
}

// Resolves whether a wallet survived the Academy reward floor in a window. The
// default hits the per-wallet actor API; the cron supplies a set-backed
// implementation.
export type Qualifier = {
  qualification(wallet: string, range?: WindowRange): Promise<RoleQualification>
}

export const defaultQualifier: Qualifier = {
  qualification: (wallet, range) => fetchAcademyRoleQualification(wallet, range),
}

// Build a Qualifier backed by pre-fetched qualifier sets (one leaderboard call
// per distinct window) for efficient bulk reconciliation.
// For floor semesters: fetches only wallets that survived the reward-floor cull.
// For no-floor semesters: fetches all wallets with any points.
export async function buildSetQualifier(args: {
  semesters: Semester[]
  includeLive: boolean
}): Promise<Qualifier> {
  const windowSets = new Map<string, Set<string>>()
  for (const s of args.semesters) {
    const key = `${s.from_ts}-${s.to_ts}`
    if (!windowSets.has(key)) {
      const fetcher = s.require_floor
        ? fetchWindowQualifiers
        : fetchWindowParticipants
      windowSets.set(
        key,
        await fetcher({ from: s.from_ts, to: s.to_ts }),
      )
    }
  }
  const liveSet = args.includeLive ? await fetchWindowQualifiers() : null
  return {
    qualification: (wallet, range) => {
      const set = range ? windowSets.get(`${range.from}-${range.to}`) : liveSet
      const qualifies = set?.has(wallet.toLowerCase()) ?? false
      return Promise.resolve({
        qualifies,
        pointsWad: qualifies ? 1n : 0n,
      })
    },
  }
}

export type SemesterQualification = {
  semester_id: string
  label: string
  role_id: string
  qualifies: boolean
  pointsWad: bigint
  from_ts: number
  to_ts: number
  require_floor: boolean
}

export type ReconcileResult = {
  grantedRoles: string[]
  semesters: SemesterQualification[]
  liveRoleId: string | null
  liveQualifies: boolean
  livePointsWad: bigint | null
}

// Bring a member's Discord roles into agreement with their Academy allocation:
// hold each semester's role iff their simulated reward survives the reward floor,
// plus the optional live role (when DISCORD_ROLE_ID is set) iff the rolling
// window survives the floor. Adds/removes only the roles the bot manages and
// persists granted_roles.
export async function reconcileRoles(args: {
  supabase: SupabaseClient
  link: DiscordWalletLink
  semesters: Semester[]
  qualifier?: Qualifier
}): Promise<ReconcileResult> {
  const { supabase, link, semesters } = args
  const qualifier = args.qualifier ?? defaultQualifier
  const guildId = link.guild_id ?? Deno.env.get("DISCORD_GUILD_ID")
  if (!guildId) throw new Error("Missing DISCORD_GUILD_ID")

  const target = new Set<string>()
  const managed = new Set<string>()
  const semesterResults: SemesterQualification[] = []

  // Register all managed role IDs up-front before parallel checks.
  for (const s of semesters) managed.add(s.role_id)
  const liveRoleId = Deno.env.get("DISCORD_ROLE_ID") ?? null
  if (liveRoleId) managed.add(liveRoleId)

  // Run all qualification checks in parallel — each is an independent
  // simulation call, so serial execution doubles (or worse) the latency.
  const [semChecks, liveQ] = await Promise.all([
    Promise.all(
      semesters.map(async (s) => {
        const q = await qualifier.qualification(link.wallet_address, {
          from: s.from_ts,
          to: s.to_ts,
        })
        const qualified = s.require_floor ? q.qualifies : q.pointsWad > 0n
        return { s, q, qualified }
      }),
    ),
    liveRoleId
      ? qualifier.qualification(link.wallet_address)
      : Promise.resolve(null),
  ])

  for (const { s, q, qualified } of semChecks) {
    if (qualified) target.add(s.role_id)
    semesterResults.push({
      semester_id: s.semester_id,
      label: s.label,
      role_id: s.role_id,
      qualifies: qualified,
      pointsWad: q.pointsWad,
      from_ts: s.from_ts,
      to_ts: s.to_ts,
      require_floor: s.require_floor,
    })
  }

  let liveQualifies = false
  let livePointsWad: bigint | null = null
  if (liveRoleId && liveQ) {
    livePointsWad = liveQ.pointsWad
    liveQualifies = liveQ.qualifies
    if (liveQualifies) target.add(liveRoleId)
  }

  const granted = new Set(link.granted_roles ?? [])

  // Add newly-qualifying roles.
  for (const roleId of target) {
    if (!granted.has(roleId)) {
      if (await addGuildRole({ guildId, userId: link.discord_user_id, roleId })) {
        granted.add(roleId)
      }
    }
  }
  // Remove managed roles that no longer qualify (leave unmanaged roles untouched).
  for (const roleId of [...granted]) {
    if (managed.has(roleId) && !target.has(roleId)) {
      if (
        await removeGuildRole({ guildId, userId: link.discord_user_id, roleId })
      ) {
        granted.delete(roleId)
      }
    }
  }

  const grantedRoles = [...granted]
  await supabase
    .from("discord_wallet_links")
    .update({ granted_roles: grantedRoles })
    .eq("discord_user_id", link.discord_user_id)

  return {
    grantedRoles,
    semesters: semesterResults,
    liveRoleId,
    liveQualifies,
    livePointsWad,
  }
}

// Remove every bot-managed role from a member (used on unlink) and clear
// granted_roles. Reads semesters to know which roles are managed.
export async function revokeAllRoles(args: {
  supabase: SupabaseClient
  link: DiscordWalletLink
  semesters: Semester[]
}): Promise<void> {
  const { supabase, link, semesters } = args
  const guildId = link.guild_id ?? Deno.env.get("DISCORD_GUILD_ID")
  const roleId = Deno.env.get("DISCORD_ROLE_ID")
  const managed = new Set<string>(semesters.map((s) => s.role_id))
  if (roleId) managed.add(roleId)
  if (!guildId) return

  for (const role of link.granted_roles ?? []) {
    if (managed.has(role)) {
      await removeGuildRole({ guildId, userId: link.discord_user_id, roleId: role })
    }
  }
}
