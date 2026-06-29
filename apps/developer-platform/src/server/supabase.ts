import { type User, createClient } from "@supabase/supabase-js"
import type { NextApiRequest } from "next"
import { isAddress } from "viem"
import { z } from "zod"

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "build-placeholder-service-key",
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export function bearerToken(request: NextApiRequest): string | null {
  const header = request.headers.authorization
  return header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : null
}

export async function authenticatedUser(
  request: NextApiRequest,
): Promise<User | null> {
  const token = bearerToken(request)
  if (!token) return null
  const { data, error } = await createAdminClient().auth.getUser(token)
  return error ? null : data.user
}

const unknownRecordSchema = z.record(z.string(), z.unknown())

function findWalletAddress(value: unknown, depth = 0): string | null {
  if (depth > 3) return null
  if (typeof value === "string" && isAddress(value)) return value.toLowerCase()
  if (Array.isArray(value)) {
    for (const item of value) {
      const address = findWalletAddress(item, depth + 1)
      if (address) return address
    }
  }
  const record = unknownRecordSchema.safeParse(value)
  if (record.success) {
    for (const key of ["address", "wallet_address", "sub"]) {
      const address = findWalletAddress(record.data[key], depth + 1)
      if (address) return address
    }
    for (const nested of Object.values(record.data)) {
      const address = findWalletAddress(nested, depth + 1)
      if (address) return address
    }
  }
  return null
}

export function walletAddressForUser(user: User): string | null {
  return (
    findWalletAddress(user.user_metadata) ??
    findWalletAddress(
      user.identities?.map((identity) => identity.identity_data),
    )
  )
}
