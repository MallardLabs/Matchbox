import { addressSchema } from "@repo/platform-contracts/common"
import {
  appStatusSchema,
  clientTypeSchema,
  reviewStateSchema,
} from "@repo/platform-contracts/console"
import { grantRevokedReasonSchema } from "@repo/platform-contracts/identity"
import {
  environmentKindSchema,
  networkSlugSchema,
} from "@repo/platform-contracts/network"
import { promptSchema } from "@repo/platform-contracts/oidc"
import {
  type QuotaOverride,
  endpointClassSchema,
} from "@repo/platform-contracts/rate-limits"
import {
  oidcScopeSchema,
  platformScopeSchema,
} from "@repo/platform-contracts/scopes"
import { recordAudit } from "@repo/platform-server"
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import type {
  AccountRecord,
  ClientRecord,
  GrantRecord,
  IdStore,
  PurgeCounts,
  RefreshTokenRecord,
  RotateRefreshTokenResult,
  SessionRecord,
} from "./id-store"

/** Production `IdStore` over Supabase Postgres (service role). */

const dateSchema = z.string().transform((value) => new Date(value))
const nullableDateSchema = dateSchema.nullable()

const appRowSchema = z
  .object({
    id: z.string(),
    organization_id: z.string(),
    name: z.string(),
    logo_url: z.string().nullable(),
    website_url: z.string().nullable(),
    privacy_url: z.string().nullable(),
    terms_url: z.string().nullable(),
    status: appStatusSchema,
  })
  .transform((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    logoUrl: row.logo_url,
    websiteUrl: row.website_url,
    privacyUrl: row.privacy_url,
    termsUrl: row.terms_url,
    status: row.status,
  }))

const environmentColumns = {
  id: z.string(),
  app_id: z.string(),
  kind: environmentKindSchema,
  network: networkSlugSchema,
  client_id: z.string(),
  client_type: clientTypeSchema,
  review_state: reviewStateSchema,
  requested_scopes: z.array(platformScopeSchema),
  approved_scopes: z.array(platformScopeSchema),
  scope_version: z.number().int(),
  sector_id: z.string(),
}

function environmentFromRow(
  row: z.infer<z.ZodObject<typeof environmentColumns>>,
) {
  return {
    id: row.id,
    appId: row.app_id,
    kind: row.kind,
    network: row.network,
    clientId: row.client_id,
    clientType: row.client_type,
    reviewState: row.review_state,
    requestedScopes: row.requested_scopes,
    approvedScopes: row.approved_scopes,
    scopeVersion: row.scope_version,
    sectorId: row.sector_id,
  }
}

const environmentRowSchema = z
  .object(environmentColumns)
  .transform(environmentFromRow)

const clientRowSchema = z
  .object({
    ...environmentColumns,
    app: appRowSchema,
    redirect_uris: z.array(z.object({ uri: z.string() })),
  })
  .transform(
    (row): ClientRecord => ({
      app: row.app,
      environment: environmentFromRow(row),
      redirectUris: row.redirect_uris.map((entry) => entry.uri),
    }),
  )

const clientSelect =
  "*, app:mbx_dev_apps!inner(*), redirect_uris:mbx_dev_redirect_uris(uri)"

const clientSecretRowSchema = z
  .object({
    id: z.string(),
    prefix: z.string(),
    secret_hash: z.string(),
    expires_at: nullableDateSchema,
    revoked_at: nullableDateSchema,
  })
  .transform((row) => ({
    id: row.id,
    prefix: row.prefix,
    secretHash: row.secret_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }))

const accountRowSchema = z
  .object({
    id: z.string(),
    wallet_address: addressSchema,
    created_at: dateSchema,
    last_sign_in_at: nullableDateSchema,
    disabled_at: nullableDateSchema,
  })
  .transform(
    (row): AccountRecord => ({
      id: row.id,
      walletAddress: row.wallet_address,
      createdAt: row.created_at,
      lastSignInAt: row.last_sign_in_at,
      disabledAt: row.disabled_at,
    }),
  )

const sessionColumns =
  "id, account_id, created_at, expires_at, last_seen_at, revoked_at, user_agent, ip_prefix, siwe_chain_id, signer_kind"

const sessionRowSchema = z
  .object({
    id: z.string(),
    account_id: z.string(),
    created_at: dateSchema,
    expires_at: dateSchema,
    last_seen_at: nullableDateSchema,
    revoked_at: nullableDateSchema,
    user_agent: z.string().nullable(),
    ip_prefix: z.string().nullable(),
    siwe_chain_id: z.number().int().positive().nullable(),
    signer_kind: z.enum(["eoa", "contract"]).nullable(),
  })
  .transform(
    (row): SessionRecord => ({
      id: row.id,
      accountId: row.account_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at,
      userAgent: row.user_agent,
      ipPrefix: row.ip_prefix,
      siweChainId: row.siwe_chain_id,
      signerKind: row.signer_kind,
    }),
  )

const discordLinkRowSchema = z
  .object({
    discord_user_id: z.string(),
    wallet_address: z.string(),
    discord_username: z.string().nullable(),
    discord_global_name: z.string().nullable(),
    discord_avatar: z.string().nullable(),
  })
  .transform((row) => ({
    discordUserId: row.discord_user_id,
    walletAddress: row.wallet_address.toLowerCase(),
    username: row.discord_username,
    globalName: row.discord_global_name,
    avatarHash: row.discord_avatar,
  }))

const authorizationRequestRowSchema = z
  .object({
    id: z.string(),
    environment_id: z.string(),
    redirect_uri: z.string(),
    state: z.string(),
    scopes: z.array(oidcScopeSchema),
    code_challenge: z.string(),
    nonce: z.string().nullable(),
    prompt: promptSchema.nullable(),
    created_at: dateSchema,
    expires_at: dateSchema,
    consumed_at: nullableDateSchema,
  })
  .transform((row) => ({
    id: row.id,
    environmentId: row.environment_id,
    redirectUri: row.redirect_uri,
    state: row.state,
    scopes: row.scopes,
    codeChallenge: row.code_challenge,
    nonce: row.nonce,
    prompt: row.prompt,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  }))

const claimsSnapshotSchema = z
  .array(z.object({ claim: z.string(), label: z.string() }))
  .catch([])

const grantRowSchema = z
  .object({
    id: z.string(),
    account_id: z.string(),
    app_id: z.string(),
    environment_id: z.string(),
    scopes: z.array(oidcScopeSchema),
    scope_version: z.number().int(),
    claims_snapshot: claimsSnapshotSchema,
    discord_user_id: z.string().nullable(),
    created_at: dateSchema,
    updated_at: dateSchema,
    revoked_at: nullableDateSchema,
    revoked_reason: grantRevokedReasonSchema.nullable(),
  })
  .transform(
    (row): GrantRecord => ({
      id: row.id,
      accountId: row.account_id,
      appId: row.app_id,
      environmentId: row.environment_id,
      scopes: row.scopes,
      scopeVersion: row.scope_version,
      claimsSnapshot: row.claims_snapshot,
      discordUserId: row.discord_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revokedAt: row.revoked_at,
      revokedReason: row.revoked_reason,
    }),
  )

const connectedGrantRowSchema = z.object({
  grant: grantRowSchema,
  app: appRowSchema,
  environment: environmentRowSchema,
})

const authorizationCodeRowSchema = z
  .object({
    code_hash: z.string(),
    grant_id: z.string(),
    environment_id: z.string(),
    redirect_uri: z.string(),
    code_challenge: z.string(),
    nonce: z.string().nullable(),
    scopes: z.array(oidcScopeSchema),
    auth_time: dateSchema,
    expires_at: dateSchema,
    consumed_at: nullableDateSchema,
  })
  .transform((row) => ({
    codeHash: row.code_hash,
    grantId: row.grant_id,
    environmentId: row.environment_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    nonce: row.nonce,
    scopes: row.scopes,
    authTime: row.auth_time,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  }))

const refreshTokenRowSchema = z
  .object({
    id: z.string(),
    token_hash: z.string(),
    grant_id: z.string(),
    family_id: z.string(),
    parent_id: z.string().nullable(),
    scopes: z.array(oidcScopeSchema),
    auth_time: dateSchema,
    expires_at: dateSchema,
    created_at: dateSchema,
    rotated_at: nullableDateSchema,
    revoked_at: nullableDateSchema,
  })
  .transform(
    (row): RefreshTokenRecord => ({
      id: row.id,
      tokenHash: row.token_hash,
      grantId: row.grant_id,
      familyId: row.family_id,
      parentId: row.parent_id,
      scopes: row.scopes,
      authTime: row.auth_time,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      rotatedAt: row.rotated_at,
      revokedAt: row.revoked_at,
    }),
  )

const accessTokenRowSchema = z
  .object({
    jti: z.string(),
    grant_id: z.string(),
    expires_at: dateSchema,
    revoked_at: nullableDateSchema,
  })
  .transform((row) => ({
    jti: row.jti,
    grantId: row.grant_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }))

const pairwiseRowSchema = z.object({ subject: z.string() })

const issueCodeTokensResultSchema = z.enum([
  "issued",
  "family-revoked",
  "grant-revoked",
])

const rotateResultSchema = z
  .discriminatedUnion("status", [
    z.object({
      status: z.literal("rotated"),
      familyId: z.string(),
      tokenId: z.string(),
    }),
    z.object({ status: z.literal("reused"), familyId: z.string() }),
    z.object({ status: z.literal("invalid") }).loose(),
  ])
  .transform(
    (result): RotateRefreshTokenResult =>
      result.status === "invalid" ? { status: "invalid" } : result,
  )

const purgeCountsSchema = z.object({
  siweNonces: z.number().int().nonnegative(),
  authorizationRequests: z.number().int().nonnegative(),
  authorizationCodes: z.number().int().nonnegative(),
  accessTokens: z.number().int().nonnegative(),
  refreshTokens: z.number().int().nonnegative(),
  tokenFamilies: z.number().int().nonnegative(),
}) satisfies z.ZodType<PurgeCounts>

const quotaOverrideRowSchema = z
  .object({
    endpoint_class: endpointClassSchema,
    per_minute: z.number().int().positive(),
    per_day: z.number().int().positive(),
    expires_at: z.string().nullable(),
  })
  .transform(
    (row): QuotaOverride => ({
      endpointClass: row.endpoint_class,
      perMinute: row.per_minute,
      perDay: row.per_day,
      expiresAt: row.expires_at,
    }),
  )

function parseRpcResult<Schema extends z.ZodType>(
  operation: string,
  schema: Schema,
  data: unknown,
): z.output<Schema> {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new Error(`Unexpected ${operation} result`, { cause: parsed.error })
  }
  return parsed.data
}

function fail(operation: string, error: PostgrestError): never {
  throw new Error(`Supabase ${operation} failed: ${error.code}`, {
    cause: error,
  })
}

function parseRows<Schema extends z.ZodType>(
  operation: string,
  schema: Schema,
  data: unknown,
): Array<z.output<Schema>> {
  const parsed = z.array(schema).safeParse(data ?? [])
  if (!parsed.success) {
    throw new Error(`Unexpected ${operation} rows`, { cause: parsed.error })
  }
  return parsed.data
}

function parseRow<Schema extends z.ZodType>(
  operation: string,
  schema: Schema,
  data: unknown,
): z.output<Schema> | null {
  if (data === null || data === undefined) return null
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new Error(`Unexpected ${operation} row`, { cause: parsed.error })
  }
  return parsed.data
}

function iso(date: Date): string {
  return date.toISOString()
}

export default function createSupabaseIdStore(
  supabase: SupabaseClient,
): IdStore {
  async function revokeTokensForGrant(grantId: string, now: Date) {
    const refresh = await supabase
      .from("mbx_id_refresh_tokens")
      .update({ revoked_at: iso(now) })
      .eq("grant_id", grantId)
      .is("revoked_at", null)
    if (refresh.error !== null) fail("revoke refresh tokens", refresh.error)
    const access = await supabase
      .from("mbx_id_access_tokens")
      .update({ revoked_at: iso(now) })
      .eq("grant_id", grantId)
      .is("revoked_at", null)
    if (access.error !== null) fail("revoke access tokens", access.error)
  }

  const store: IdStore = {
    async findClient(clientId) {
      const { data, error } = await supabase
        .from("mbx_dev_environments")
        .select(clientSelect)
        .eq("client_id", clientId)
        .maybeSingle()
      if (error !== null) fail("find client", error)
      return parseRow("client", clientRowSchema, data)
    },
    async findEnvironment(environmentId) {
      const { data, error } = await supabase
        .from("mbx_dev_environments")
        .select(clientSelect)
        .eq("id", environmentId)
        .maybeSingle()
      if (error !== null) fail("find environment", error)
      return parseRow("environment", clientRowSchema, data)
    },
    async listClientSecrets(environmentId) {
      const now = iso(new Date())
      const { data, error } = await supabase
        .from("mbx_dev_client_secrets")
        .select("id, prefix, secret_hash, expires_at, revoked_at")
        .eq("environment_id", environmentId)
        .is("revoked_at", null)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
      if (error !== null) fail("list client secrets", error)
      return parseRows("client secret", clientSecretRowSchema, data)
    },

    async upsertAccountForSignIn(walletAddress, now) {
      const { data, error } = await supabase
        .from("mbx_id_accounts")
        .upsert(
          { wallet_address: walletAddress, last_sign_in_at: iso(now) },
          { onConflict: "wallet_address" },
        )
        .select()
        .single()
      if (error !== null) fail("upsert account", error)
      const account = parseRow("account", accountRowSchema, data)
      if (account === null) throw new Error("Account upsert returned no row")
      return account
    },
    async findAccount(accountId) {
      const { data, error } = await supabase
        .from("mbx_id_accounts")
        .select()
        .eq("id", accountId)
        .maybeSingle()
      if (error !== null) fail("find account", error)
      return parseRow("account", accountRowSchema, data)
    },
    async createSiweNonce(nonce, expiresAt) {
      const { error } = await supabase
        .from("mbx_id_siwe_nonces")
        .insert({ nonce, expires_at: iso(expiresAt) })
      if (error !== null) fail("create nonce", error)
    },
    async consumeSiweNonce(nonce, now) {
      const { data, error } = await supabase
        .from("mbx_id_siwe_nonces")
        .update({ consumed_at: iso(now) })
        .eq("nonce", nonce)
        .is("consumed_at", null)
        .gt("expires_at", iso(now))
        .select("nonce")
      if (error !== null) fail("consume nonce", error)
      return (data ?? []).length === 1
    },
    async createSession(input) {
      const { data, error } = await supabase
        .from("mbx_id_sessions")
        .insert({
          account_id: input.accountId,
          token_hash: input.tokenHash,
          created_at: iso(input.createdAt),
          expires_at: iso(input.expiresAt),
          user_agent: input.userAgent,
          ip_prefix: input.ipPrefix,
          siwe_chain_id: input.siweChainId,
          signer_kind: input.signerKind,
        })
        .select(sessionColumns)
        .single()
      if (error !== null) fail("create session", error)
      const session = parseRow("session", sessionRowSchema, data)
      if (session === null) throw new Error("Session insert returned no row")
      return session
    },
    async findSessionByTokenHash(tokenHash) {
      const { data, error } = await supabase
        .from("mbx_id_sessions")
        .select(sessionColumns)
        .eq("token_hash", tokenHash)
        .maybeSingle()
      if (error !== null) fail("find session", error)
      return parseRow("session", sessionRowSchema, data)
    },
    async touchSession(sessionId, now) {
      const { error } = await supabase
        .from("mbx_id_sessions")
        .update({ last_seen_at: iso(now) })
        .eq("id", sessionId)
      if (error !== null) fail("touch session", error)
    },
    async listActiveSessions(accountId, now) {
      const { data, error } = await supabase
        .from("mbx_id_sessions")
        .select(sessionColumns)
        .eq("account_id", accountId)
        .is("revoked_at", null)
        .gt("expires_at", iso(now))
        .order("created_at", { ascending: false })
        .limit(50)
      if (error !== null) fail("list sessions", error)
      return parseRows("session", sessionRowSchema, data)
    },
    async revokeSession(accountId, sessionId, now) {
      const { data, error } = await supabase
        .from("mbx_id_sessions")
        .update({ revoked_at: iso(now) })
        .eq("id", sessionId)
        .eq("account_id", accountId)
        .is("revoked_at", null)
        .select("id")
      if (error !== null) fail("revoke session", error)
      return (data ?? []).length === 1
    },

    async getOrCreatePairwiseSubject(accountId, sectorId, generate) {
      async function read(): Promise<string | null> {
        const { data, error } = await supabase
          .from("mbx_id_pairwise_subjects")
          .select("subject")
          .eq("account_id", accountId)
          .eq("sector_id", sectorId)
          .maybeSingle()
        if (error !== null) fail("find pairwise subject", error)
        return (
          parseRow("pairwise subject", pairwiseRowSchema, data)?.subject ?? null
        )
      }
      const existing = await read()
      if (existing !== null) return existing
      const { error } = await supabase
        .from("mbx_id_pairwise_subjects")
        .upsert(
          { account_id: accountId, sector_id: sectorId, subject: generate() },
          { onConflict: "account_id,sector_id", ignoreDuplicates: true },
        )
      if (error !== null) fail("create pairwise subject", error)
      const created = await read()
      if (created === null) throw new Error("Pairwise subject not created")
      return created
    },
    async findDiscordLink(walletAddress) {
      const { data, error } = await supabase
        .from("discord_wallet_links")
        .select(
          "discord_user_id, wallet_address, discord_username, discord_global_name, discord_avatar",
        )
        .eq("wallet_address", walletAddress)
        .maybeSingle()
      if (error !== null) fail("find discord link", error)
      return parseRow("discord link", discordLinkRowSchema, data)
    },

    async createAuthorizationRequest(input) {
      const { data, error } = await supabase
        .from("mbx_id_authorization_requests")
        .insert({
          environment_id: input.environmentId,
          redirect_uri: input.redirectUri,
          state: input.state,
          scopes: input.scopes,
          code_challenge: input.codeChallenge,
          nonce: input.nonce,
          prompt: input.prompt,
          created_at: iso(input.createdAt),
          expires_at: iso(input.expiresAt),
        })
        .select()
        .single()
      if (error !== null) fail("create authorization request", error)
      const request = parseRow(
        "authorization request",
        authorizationRequestRowSchema,
        data,
      )
      if (request === null) throw new Error("Request insert returned no row")
      return request
    },
    async findAuthorizationRequest(id) {
      const { data, error } = await supabase
        .from("mbx_id_authorization_requests")
        .select()
        .eq("id", id)
        .maybeSingle()
      if (error !== null) fail("find authorization request", error)
      return parseRow(
        "authorization request",
        authorizationRequestRowSchema,
        data,
      )
    },
    async consumeAuthorizationRequest(id, now) {
      const { data, error } = await supabase
        .from("mbx_id_authorization_requests")
        .update({ consumed_at: iso(now) })
        .eq("id", id)
        .is("consumed_at", null)
        .gt("expires_at", iso(now))
        .select()
      if (error !== null) fail("consume authorization request", error)
      return (
        parseRows(
          "authorization request",
          authorizationRequestRowSchema,
          data,
        )[0] ?? null
      )
    },

    async findActiveGrant(accountId, environmentId) {
      const { data, error } = await supabase
        .from("mbx_id_grants")
        .select()
        .eq("account_id", accountId)
        .eq("environment_id", environmentId)
        .is("revoked_at", null)
        .maybeSingle()
      if (error !== null) fail("find active grant", error)
      return parseRow("grant", grantRowSchema, data)
    },
    async findGrant(grantId) {
      const { data, error } = await supabase
        .from("mbx_id_grants")
        .select()
        .eq("id", grantId)
        .maybeSingle()
      if (error !== null) fail("find grant", error)
      return parseRow("grant", grantRowSchema, data)
    },
    async createGrant(input, now) {
      const { data, error } = await supabase
        .from("mbx_id_grants")
        .insert({
          account_id: input.accountId,
          app_id: input.appId,
          environment_id: input.environmentId,
          scopes: input.scopes,
          scope_version: input.scopeVersion,
          claims_snapshot: input.claimsSnapshot,
          discord_user_id: input.discordUserId,
          created_at: iso(now),
          updated_at: iso(now),
        })
        .select()
        .single()
      if (error !== null) fail("create grant", error)
      const grant = parseRow("grant", grantRowSchema, data)
      if (grant === null) throw new Error("Grant insert returned no row")
      return grant
    },
    async updateGrant(grantId, update, now) {
      const { data, error } = await supabase
        .from("mbx_id_grants")
        .update({
          scopes: update.scopes,
          scope_version: update.scopeVersion,
          claims_snapshot: update.claimsSnapshot,
          discord_user_id: update.discordUserId,
          updated_at: iso(now),
        })
        .eq("id", grantId)
        .select()
        .single()
      if (error !== null) fail("update grant", error)
      const grant = parseRow("grant", grantRowSchema, data)
      if (grant === null) throw new Error("Grant update returned no row")
      return grant
    },
    async listActiveGrants(accountId) {
      const { data, error } = await supabase
        .from("mbx_id_grants")
        .select(
          "*, app:mbx_dev_apps!inner(*), environment:mbx_dev_environments!inner(*)",
        )
        .eq("account_id", accountId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
      if (error !== null) fail("list grants", error)
      const rows = z
        .array(
          z
            .object({ app: z.unknown(), environment: z.unknown() })
            .loose()
            .transform((row) => {
              const { app, environment, ...grant } = row
              return { grant, app, environment }
            }),
        )
        .parse(data ?? [])
      return parseRows("connected grant", connectedGrantRowSchema, rows)
    },
    async revokeGrant(grantId, reason, now) {
      const { data, error } = await supabase
        .from("mbx_id_grants")
        .update({ revoked_at: iso(now), revoked_reason: reason })
        .eq("id", grantId)
        .is("revoked_at", null)
        .select("id")
      if (error !== null) fail("revoke grant", error)
      if ((data ?? []).length === 0) return false
      await revokeTokensForGrant(grantId, now)
      return true
    },

    async createAuthorizationCode(input) {
      const { error } = await supabase
        .from("mbx_id_authorization_codes")
        .insert({
          code_hash: input.codeHash,
          grant_id: input.grantId,
          environment_id: input.environmentId,
          redirect_uri: input.redirectUri,
          code_challenge: input.codeChallenge,
          code_challenge_method: "S256",
          nonce: input.nonce,
          scopes: input.scopes,
          auth_time: iso(input.authTime),
          expires_at: iso(input.expiresAt),
        })
      if (error !== null) fail("create authorization code", error)
    },
    async consumeAuthorizationCode(codeHash, now) {
      const { data, error } = await supabase
        .from("mbx_id_authorization_codes")
        .update({ consumed_at: iso(now) })
        .eq("code_hash", codeHash)
        .is("consumed_at", null)
        .select()
      if (error !== null) fail("consume authorization code", error)
      return (
        parseRows("authorization code", authorizationCodeRowSchema, data)[0] ??
        null
      )
    },
    async findAuthorizationCode(codeHash) {
      const { data, error } = await supabase
        .from("mbx_id_authorization_codes")
        .select()
        .eq("code_hash", codeHash)
        .maybeSingle()
      if (error !== null) fail("find authorization code", error)
      return parseRow("authorization code", authorizationCodeRowSchema, data)
    },

    async findRefreshTokenByHash(tokenHash) {
      const { data, error } = await supabase
        .from("mbx_id_refresh_tokens")
        .select()
        .eq("token_hash", tokenHash)
        .maybeSingle()
      if (error !== null) fail("find refresh token", error)
      return parseRow("refresh token", refreshTokenRowSchema, data)
    },
    async issueCodeTokens(input) {
      const { data, error } = await supabase.rpc("mbx_id_issue_code_tokens", {
        p_family_id: input.familyId,
        p_grant_id: input.grantId,
        p_refresh_token_id: input.refreshTokenId,
        p_refresh_token_hash: input.refreshTokenHash,
        p_scopes: input.scopes,
        p_auth_time: iso(input.authTime),
        p_refresh_expires_at: iso(input.refreshExpiresAt),
        p_access_jti: input.accessJti,
        p_access_expires_at: iso(input.accessExpiresAt),
        p_now: iso(input.now),
      })
      if (error !== null) fail("issue code tokens", error)
      return parseRpcResult(
        "issue code tokens",
        issueCodeTokensResultSchema,
        data,
      )
    },
    async rotateRefreshToken(input) {
      const { data, error } = await supabase.rpc(
        "mbx_id_rotate_refresh_token",
        {
          p_old_hash: input.oldTokenHash,
          p_new_hash: input.newTokenHash,
          p_new_id: input.newTokenId,
          p_expires_at: iso(input.expiresAt),
          p_scopes: input.scopes,
          p_access_jti: input.accessJti,
          p_access_expires_at: iso(input.accessExpiresAt),
          p_now: iso(input.now),
        },
      )
      if (error !== null) fail("rotate refresh token", error)
      return parseRpcResult("rotate refresh token", rotateResultSchema, data)
    },
    async revokeTokenFamily(familyId, now) {
      const { error } = await supabase.rpc("mbx_id_revoke_token_family", {
        p_family_id: familyId,
        p_now: iso(now),
      })
      if (error !== null) fail("revoke token family", error)
    },

    async findAccessToken(jti) {
      const { data, error } = await supabase
        .from("mbx_id_access_tokens")
        .select("jti, grant_id, expires_at, revoked_at")
        .eq("jti", jti)
        .maybeSingle()
      if (error !== null) fail("find access token", error)
      return parseRow("access token", accessTokenRowSchema, data)
    },
    async revokeAccessToken(jti, now) {
      const { error } = await supabase
        .from("mbx_id_access_tokens")
        .update({ revoked_at: iso(now) })
        .eq("jti", jti)
        .is("revoked_at", null)
      if (error !== null) fail("revoke access token", error)
    },
    async listQuotaOverrides(environmentId, now) {
      const { data, error } = await supabase
        .from("mbx_dev_quota_overrides")
        .select("endpoint_class, per_minute, per_day, expires_at")
        .eq("environment_id", environmentId)
        .or(`expires_at.is.null,expires_at.gt.${iso(now)}`)
        .order("created_at", { ascending: false })
        .limit(50)
      if (error !== null) fail("list quota overrides", error)
      return parseRows("quota override", quotaOverrideRowSchema, data)
    },
    async purgeExpired(now, batchSize) {
      const { data, error } = await supabase.rpc("mbx_id_purge_expired", {
        p_now: iso(now),
        p_batch_size: batchSize,
      })
      if (error !== null) fail("purge expired rows", error)
      return parseRpcResult("purge expired rows", purgeCountsSchema, data)
    },

    async recordAudit(event) {
      await recordAudit(supabase, event)
    },
  }
  return store
}
