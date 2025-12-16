import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  console.warn("Missing NEXT_PUBLIC_SUPABASE_URL environment variable")
}

if (!supabaseAnonKey) {
  console.warn("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable")
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "")

export type GaugeProfile = {
  gauge_address: string
  vebtc_token_id: string
  owner_address: string
  profile_picture_url: string | null
  description: string | null
  display_name: string | null
  created_at: string
  updated_at: string
}
