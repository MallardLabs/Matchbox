import { parseClientSecret } from "@repo/platform-contracts/credentials"
import { hmacHex, timingSafeEqualHex } from "@repo/platform-server"
import type { Context } from "hono"
import type { AppDeps } from "../deps"
import type { ClientRecord } from "../store/id-store"

/**
 * Token/revocation endpoint client authentication (RFC 6749 §2.3):
 * confidential clients use `client_secret_basic` or `client_secret_post`;
 * public clients use `none` (client_id only) and must not send a secret.
 */

export type ClientAuthResult =
  | { ok: true; client: ClientRecord }
  | {
      ok: false
      error: "invalid_client" | "invalid_request"
      description: string
      /** Credentials arrived in the Authorization header. */
      usedBasic: boolean
    }

type BasicCredentials = { clientId: string; clientSecret: string }

function decodeFormComponent(value: string): string | null {
  try {
    return decodeURIComponent(value.replaceAll("+", " "))
  } catch {
    return null
  }
}

function parseBasicAuthorization(
  header: string | undefined,
): BasicCredentials | "malformed" | null {
  if (header === undefined) return null
  const match = /^Basic[ ]+([A-Za-z0-9+/=]+)[ ]*$/i.exec(header)
  if (match?.[1] === undefined) return "malformed"
  let decoded: string
  try {
    decoded = atob(match[1])
  } catch {
    return "malformed"
  }
  const separator = decoded.indexOf(":")
  if (separator < 0) return "malformed"
  const clientId = decodeFormComponent(decoded.slice(0, separator))
  const clientSecret = decodeFormComponent(decoded.slice(separator + 1))
  if (clientId === null || clientSecret === null) return "malformed"
  return { clientId, clientSecret }
}

async function secretMatches(
  deps: AppDeps,
  client: ClientRecord,
  secret: string,
): Promise<boolean> {
  const parsed = parseClientSecret(secret)
  if (parsed === null) return false
  const now = deps.now()
  const candidates = (
    await deps.store.listClientSecrets(client.environment.id)
  ).filter(
    (candidate) =>
      candidate.prefix === parsed.prefix &&
      candidate.revokedAt === null &&
      (candidate.expiresAt === null || candidate.expiresAt > now),
  )
  if (candidates.length === 0) return false
  const hash = await hmacHex(deps.config.clientSecretPepper, secret)
  return candidates.some((candidate) =>
    timingSafeEqualHex(candidate.secretHash, hash),
  )
}

export async function authenticateClient(
  c: Context,
  deps: AppDeps,
  body: { client_id?: string | undefined; client_secret?: string | undefined },
): Promise<ClientAuthResult> {
  const basic = parseBasicAuthorization(c.req.header("Authorization"))
  const usedBasic = basic !== null
  function failure(
    error: "invalid_client" | "invalid_request",
    description: string,
  ): ClientAuthResult {
    return { ok: false, error, description, usedBasic }
  }
  if (basic === "malformed") {
    return failure("invalid_client", "Malformed client credentials")
  }
  if (basic !== null && body.client_secret !== undefined) {
    return failure("invalid_request", "Use one client authentication method")
  }
  if (
    basic !== null &&
    body.client_id !== undefined &&
    body.client_id !== basic.clientId
  ) {
    return failure("invalid_request", "client_id mismatch")
  }
  const clientId = basic?.clientId ?? body.client_id
  const secret = basic?.clientSecret ?? body.client_secret
  if (clientId === undefined) {
    return failure("invalid_client", "Client authentication required")
  }
  const client = await deps.store.findClient(clientId)
  if (client === null) return failure("invalid_client", "Unknown client")

  if (client.environment.clientType === "public") {
    if (secret !== undefined) {
      return failure("invalid_client", "Public clients use no client secret")
    }
    return { ok: true, client }
  }
  if (secret === undefined || !(await secretMatches(deps, client, secret))) {
    return failure("invalid_client", "Client authentication failed")
  }
  return { ok: true, client }
}
