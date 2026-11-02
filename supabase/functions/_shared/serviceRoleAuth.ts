// Caller authorization for scheduled service-role jobs. The public anon key
// also passes the gateway's verify_jwt, so each job checks the caller itself
// before creating any client: the bearer token must be the service role key,
// or the x-matchbox-job-secret header must match MATCHBOX_JOB_SECRET when that
// secret is set. JWT claims are never trusted on their own.

import { corsHeaders } from "./cors.ts"

export const JOB_SECRET_HEADER = "x-matchbox-job-secret"

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  )
}

/** Compares secrets without leaking where they differ or how long they are. */
export async function secretsMatch(
  provided: string,
  expected: string,
): Promise<boolean> {
  if (expected === "") return false
  const [left, right] = await Promise.all([digest(provided), digest(expected)])
  let difference = 0
  for (let index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? ""
  return /^Bearer\s+(\S+)$/i.exec(header.trim())?.[1] ?? ""
}

export async function isServiceRequest(
  request: Request,
  secrets: { serviceRoleKey: string; jobSecret: string },
): Promise<boolean> {
  const [serviceRole, jobSecret] = await Promise.all([
    secretsMatch(bearerToken(request), secrets.serviceRoleKey),
    secretsMatch(
      request.headers.get(JOB_SECRET_HEADER) ?? "",
      secrets.jobSecret,
    ),
  ])
  return serviceRole || jobSecret
}

/** A 401 response for callers without the service role, otherwise null. */
export async function requireServiceRole(
  request: Request,
): Promise<Response | null> {
  const authorized = await isServiceRequest(request, {
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    jobSecret: Deno.env.get("MATCHBOX_JOB_SECRET") ?? "",
  })
  if (authorized) return null
  return new Response(
    JSON.stringify({ success: false, error: "unauthorized" }),
    {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  )
}
