import { type SupabaseClient, createClient } from "@supabase/supabase-js"

export type SupabaseEnv = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

/**
 * Service-role Supabase client for Workers. Never persists or refreshes a
 * session: Supabase is only the data store (no Supabase Auth).
 */
export default function createSupabaseAdmin(env: SupabaseEnv): SupabaseClient {
  if (
    env.SUPABASE_URL.length === 0 ||
    env.SUPABASE_SERVICE_ROLE_KEY.length === 0
  ) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Client-Info": "matchbox-platform-server" },
    },
  })
}
