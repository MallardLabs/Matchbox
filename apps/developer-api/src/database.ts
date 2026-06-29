import { type SupabaseClient, createClient } from "@supabase/supabase-js"
import type { Environment } from "./types"

export function createDatabase(environment: Environment): SupabaseClient {
  return createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
