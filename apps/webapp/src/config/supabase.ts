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

export type SocialLinks = {
  twitter?: string
  discord?: string
  telegram?: string
  github?: string
  medium?: string
  website?: string
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
  is_featured: boolean
  created_at: string
  updated_at: string
}

export type GaugeHistory = {
  id: number
  gauge_address: string
  epoch_start: number
  vemezo_weight: string | null
  vebtc_weight: string | null
  boost_multiplier: number | null
  total_incentives_usd: number | null
  apy: number | null
  unique_voters: number | null
  recorded_at: string
}

export type ProfileTransfer = {
  id: number
  owner_address: string
  from_gauge_address: string
  to_gauge_address: string
  epoch_start: number
  transferred_at: string
}
