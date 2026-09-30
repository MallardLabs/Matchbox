import {
  apiKeyListResponseSchema,
  apiKeyRecordSchema,
  clientSecretListResponseSchema,
  clientSecretRecordSchema,
  consolePaths,
  createApiKeyRequestSchema,
  createClientSecretRequestSchema,
  createdApiKeyResponseSchema,
  createdClientSecretResponseSchema,
  credentialStatus,
  expireApiKeyRequestSchema,
  maxActiveClientSecrets,
  rotateApiKeyRequestSchema,
  rotatedApiKeyResponseSchema,
  updateApiKeyRequestSchema,
} from "@repo/platform-contracts/console"
import type { ApiKeyKind } from "@repo/platform-contracts/credentials"
import type { ErrorIssue } from "@repo/platform-contracts/errors"
import {
  PlatformError,
  generateApiKey,
  generateClientSecret,
  hmacHex,
  jsonBody,
  normalizeCidr,
  pathParams,
} from "@repo/platform-server"
import {
  type EnvironmentAccess,
  assertAppWritable,
  credentialRole,
  environmentAccess,
} from "../access"
import {
  type ConsoleApp,
  type ConsoleContext,
  audit,
  deps,
  requireStepUp,
} from "../context"
import { respond, toApiKey, toClientSecret } from "../mappers"
import {
  type ApiKeyRow,
  type ClientSecretRow,
  StoreConflictError,
} from "../store/console-store"

/**
 * Step-up (passkey within 10 min) is required to create or rotate any
 * secret key, any live key, and any client secret.
 */
export function apiKeyNeedsStepUp(
  kind: ApiKeyKind,
  environment: EnvironmentAccess["environment"],
): boolean {
  return kind === "secret" || environment.kind === "live"
}

function normalizeCidrs(values: string[], kind: ApiKeyKind): string[] {
  if (values.length > 0 && kind !== "secret") {
    throw new PlatformError("invalid_request", {
      issues: [
        { path: "allowedCidrs", message: "Only secret keys take CIDRs" },
      ],
    })
  }
  const issues: ErrorIssue[] = []
  const normalized: string[] = []
  values.forEach((value, index) => {
    const cidr = normalizeCidr(value)
    if (cidr === null) {
      issues.push({ path: `allowedCidrs.${index}`, message: "Invalid CIDR" })
    } else if (!normalized.includes(cidr)) {
      normalized.push(cidr)
    }
  })
  if (issues.length > 0) throw new PlatformError("invalid_request", { issues })
  return normalized
}

function sameSet(left: string[], right: string[]): boolean {
  const values = new Set(left)
  return (
    values.size === new Set(right).size &&
    right.every((value) => values.has(value))
  )
}

function assertFuture(c: ConsoleContext, value: string | null, path: string) {
  if (value !== null && Date.parse(value) <= deps(c).now().getTime()) {
    throw new PlatformError("invalid_request", {
      issues: [{ path, message: "Must be in the future" }],
    })
  }
}

function auditScope(access: EnvironmentAccess) {
  return {
    organizationId: access.app.organizationId,
    appId: access.app.id,
    environmentId: access.environment.id,
  }
}

/** Inserts a key row; the plaintext exists only in the returned value. */
async function issueApiKey(
  c: ConsoleContext,
  access: EnvironmentAccess,
  input: {
    kind: ApiKeyKind
    name: string
    allowedCidrs: string[]
    expiresAt: string | null
    rotatedFrom: string | null
  },
): Promise<{ row: ApiKeyRow; key: string }> {
  const { store, config } = deps(c)
  for (let attempt = 0; attempt < 3; attempt++) {
    const generated = generateApiKey(input.kind, access.environment.kind)
    try {
      const row = await store.createApiKey({
        environmentId: access.environment.id,
        kind: input.kind,
        name: input.name,
        prefix: generated.prefix,
        secretHash: await hmacHex(config.apiKeyPepper, generated.value),
        allowedCidrs: input.allowedCidrs,
        createdBy: access.account.id,
        expiresAt: input.expiresAt,
        rotatedFrom: input.rotatedFrom,
      })
      return { row, key: generated.value }
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error
    }
  }
  throw new Error("Could not allocate an API key prefix")
}

/** Inserts a client secret row; the plaintext is only in the return value. */
async function issueClientSecret(
  c: ConsoleContext,
  access: EnvironmentAccess,
  expiresAt: string | null,
): Promise<{ row: ClientSecretRow; secret: string }> {
  const { store, config } = deps(c)
  for (let attempt = 0; attempt < 3; attempt++) {
    const generated = generateClientSecret()
    try {
      const row = await store.createClientSecret({
        environmentId: access.environment.id,
        secretHash: await hmacHex(config.clientSecretPepper, generated.value),
        prefix: generated.prefix,
        createdBy: access.account.id,
        expiresAt,
      })
      return { row, secret: generated.value }
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error
    }
  }
  throw new Error("Could not allocate a client secret prefix")
}

async function keyAccess(c: ConsoleContext, apiKeyId: string) {
  const key = await deps(c).store.getApiKey(apiKeyId)
  if (key === null) throw new PlatformError("not_found")
  const access = await environmentAccess(c, key.environmentId, credentialRole)
  return { key, access }
}

export default function registerCredentialRoutes(app: ConsoleApp): void {
  // API keys --------------------------------------------------------------

  app.get("/api/environments/:environmentId/api-keys", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const access = await environmentAccess(c, environmentId, "developer")
    const { store, now } = deps(c)
    const keys = await store.listApiKeys(environmentId)
    const at = now()
    return respond(c, apiKeyListResponseSchema, {
      data: keys.map((key) => toApiKey(key, access.environment, at)),
    })
  })

  app.post("/api/environments/:environmentId/api-keys", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const access = await environmentAccess(c, environmentId, credentialRole)
    assertAppWritable(access.app)
    const body = await jsonBody(c, createApiKeyRequestSchema)
    const allowedCidrs = normalizeCidrs(body.allowedCidrs, body.kind)
    assertFuture(c, body.expiresAt, "expiresAt")
    if (apiKeyNeedsStepUp(body.kind, access.environment)) requireStepUp(c)
    const { row, key } = await issueApiKey(c, access, {
      kind: body.kind,
      name: body.name,
      allowedCidrs,
      expiresAt: body.expiresAt,
      rotatedFrom: null,
    })
    await audit(c, {
      ...auditScope(access),
      action: "api-key-created",
      targetType: "api-key",
      targetId: row.id,
      metadata: { kind: row.kind, name: row.name, prefix: row.prefix },
    })
    return respond(
      c,
      createdApiKeyResponseSchema,
      { apiKey: toApiKey(row, access.environment, deps(c).now()), key },
      201,
    )
  })

  app.patch("/api/api-keys/:apiKeyId", async (c) => {
    const { apiKeyId } = pathParams(c, consolePaths.apiKeyId)
    const { key, access } = await keyAccess(c, apiKeyId)
    assertAppWritable(access.app)
    const body = await jsonBody(c, updateApiKeyRequestSchema)
    const patch: { name?: string; allowedCidrs?: string[] } = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.allowedCidrs !== undefined) {
      patch.allowedCidrs = normalizeCidrs(body.allowedCidrs, key.kind)
      // A secret key's network allow-list is part of its security boundary.
      if (
        key.kind === "secret" &&
        !sameSet(patch.allowedCidrs, key.allowedCidrs)
      ) {
        requireStepUp(c)
      }
    }
    const updated = await deps(c).store.updateApiKey(apiKeyId, patch)
    await audit(c, {
      ...auditScope(access),
      action: "api-key-updated",
      targetType: "api-key",
      targetId: apiKeyId,
      metadata: { fields: Object.keys(patch) },
    })
    return respond(
      c,
      apiKeyRecordSchema,
      toApiKey(updated, access.environment, deps(c).now()),
    )
  })

  app.post("/api/api-keys/:apiKeyId/rotate", async (c) => {
    const { apiKeyId } = pathParams(c, consolePaths.apiKeyId)
    const { key, access } = await keyAccess(c, apiKeyId)
    assertAppWritable(access.app)
    const body = await jsonBody(c, rotateApiKeyRequestSchema)
    const { store, now } = deps(c)
    const at = now()
    if (credentialStatus(key, at) !== "active") {
      throw new PlatformError("conflict", { message: "The key is not active." })
    }
    if (apiKeyNeedsStepUp(key.kind, access.environment)) requireStepUp(c)
    const { row, key: plaintext } = await issueApiKey(c, access, {
      kind: key.kind,
      name: key.name,
      allowedCidrs: key.allowedCidrs,
      expiresAt: key.expiresAt,
      rotatedFrom: key.id,
    })
    const overlapEnd = at.getTime() + body.overlapSeconds * 1000
    const previousExpiry =
      key.expiresAt === null
        ? overlapEnd
        : Math.min(Date.parse(key.expiresAt), overlapEnd)
    const previous = await store.updateApiKey(key.id, {
      expiresAt: new Date(previousExpiry).toISOString(),
    })
    await audit(c, {
      ...auditScope(access),
      action: "api-key-rotated",
      targetType: "api-key",
      targetId: row.id,
      metadata: {
        rotatedFrom: key.id,
        previousExpiresAt: previous.expiresAt,
        overlapSeconds: body.overlapSeconds,
      },
    })
    return respond(
      c,
      rotatedApiKeyResponseSchema,
      {
        apiKey: toApiKey(row, access.environment, at),
        key: plaintext,
        previous: toApiKey(previous, access.environment, at),
      },
      201,
    )
  })

  app.post("/api/api-keys/:apiKeyId/expire", async (c) => {
    const { apiKeyId } = pathParams(c, consolePaths.apiKeyId)
    const { key, access } = await keyAccess(c, apiKeyId)
    const body = await jsonBody(c, expireApiKeyRequestSchema)
    const { store, now } = deps(c)
    const at = now()
    if (key.revokedAt !== null) {
      throw new PlatformError("conflict", { message: "The key is revoked." })
    }
    // Clamp past values to now so an "expire now" request takes effect.
    const expiresAt = new Date(
      Math.max(Date.parse(body.expiresAt), at.getTime()),
    ).toISOString()
    // Extending a key's life (incl. reviving an expired one) is as strong
    // as issuing a new one; shortening it is not.
    if (
      key.expiresAt !== null &&
      Date.parse(expiresAt) > Date.parse(key.expiresAt)
    ) {
      requireStepUp(c)
    }
    const updated = await store.updateApiKey(apiKeyId, { expiresAt })
    await audit(c, {
      ...auditScope(access),
      action: "api-key-expiry-set",
      targetType: "api-key",
      targetId: apiKeyId,
      metadata: { expiresAt },
    })
    return respond(
      c,
      apiKeyRecordSchema,
      toApiKey(updated, access.environment, at),
    )
  })

  app.post("/api/api-keys/:apiKeyId/revoke", async (c) => {
    const { apiKeyId } = pathParams(c, consolePaths.apiKeyId)
    const { key, access } = await keyAccess(c, apiKeyId)
    const { store, now } = deps(c)
    const at = now()
    const updated =
      key.revokedAt === null
        ? await store.updateApiKey(apiKeyId, { revokedAt: at.toISOString() })
        : key
    if (key.revokedAt === null) {
      await audit(c, {
        ...auditScope(access),
        action: "api-key-revoked",
        targetType: "api-key",
        targetId: apiKeyId,
        metadata: { prefix: key.prefix },
      })
    }
    return respond(
      c,
      apiKeyRecordSchema,
      toApiKey(updated, access.environment, at),
    )
  })

  // Client secrets --------------------------------------------------------

  app.get("/api/environments/:environmentId/client-secrets", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    await environmentAccess(c, environmentId, "developer")
    const { store, now } = deps(c)
    const at = now()
    const secrets = await store.listClientSecrets(environmentId)
    return respond(c, clientSecretListResponseSchema, {
      data: secrets.map((secret) => toClientSecret(secret, at)),
    })
  })

  app.post("/api/environments/:environmentId/client-secrets", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const access = await environmentAccess(c, environmentId, "admin")
    assertAppWritable(access.app)
    const body = await jsonBody(c, createClientSecretRequestSchema)
    assertFuture(c, body.expiresAt, "expiresAt")
    if (access.environment.clientType !== "confidential") {
      throw new PlatformError("conflict", {
        message: "Public clients do not use client secrets.",
      })
    }
    const { store, now } = deps(c)
    const at = now()
    const active = (await store.listClientSecrets(environmentId)).filter(
      (secret) => credentialStatus(secret, at) === "active",
    )
    if (active.length >= maxActiveClientSecrets) {
      throw new PlatformError("conflict", {
        message: "Revoke a secret first (two active at most).",
      })
    }
    requireStepUp(c)
    const created = await issueClientSecret(c, access, body.expiresAt)
    await audit(c, {
      ...auditScope(access),
      action: "client-secret-created",
      targetType: "client-secret",
      targetId: created.row.id,
      metadata: { prefix: created.row.prefix },
    })
    return respond(
      c,
      createdClientSecretResponseSchema,
      { clientSecret: toClientSecret(created.row, at), secret: created.secret },
      201,
    )
  })

  app.post("/api/client-secrets/:clientSecretId/revoke", async (c) => {
    const { clientSecretId } = pathParams(c, consolePaths.clientSecretId)
    const { store, now } = deps(c)
    const secret = await store.getClientSecret(clientSecretId)
    if (secret === null) throw new PlatformError("not_found")
    const access = await environmentAccess(c, secret.environmentId, "admin")
    const at = now()
    const updated =
      secret.revokedAt === null
        ? await store.revokeClientSecret(clientSecretId, at.toISOString())
        : secret
    if (secret.revokedAt === null) {
      await audit(c, {
        ...auditScope(access),
        action: "client-secret-revoked",
        targetType: "client-secret",
        targetId: clientSecretId,
        metadata: { prefix: secret.prefix },
      })
    }
    return respond(c, clientSecretRecordSchema, toClientSecret(updated, at))
  })
}
