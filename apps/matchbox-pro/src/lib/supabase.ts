import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ""
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

export type SocialLinks = {
  twitter?: string
  discord?: string
  telegram?: string
  github?: string
  medium?: string
  website?: string
  other?: string
}

export type GaugeProfile = {
  gauge_address: string
  vebtc_token_id: string
  owner_address: string
  profile_picture_url: string | null
  description: string | null
  display_name: string | null
  website_url: string | null
  social_links: SocialLinks | null
  incentive_strategy: string | null
  voting_strategy: string | null
  tags: string[] | null
}
