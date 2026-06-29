import { z } from "zod"

export const apiScopeSchema = z.enum(["gauges:read", "profile:read"])

export const apiKeyRowSchema = z.object({
  id: z.uuid(),
  app_id: z.uuid(),
  key_type: z.enum(["publishable", "secret"]),
  key_prefix: z.string(),
  secret_hash: z.string(),
  scopes: z.array(apiScopeSchema),
  allowed_cidrs: z.array(z.string()),
  expires_at: z.iso.datetime().nullable(),
  revoked_at: z.iso.datetime().nullable(),
})

export const appRowSchema = z.object({
  id: z.uuid(),
  client_id: z.string(),
  name: z.string(),
  status: z.enum(["draft", "pending-review", "approved", "suspended"]),
  approved_scopes: z.array(apiScopeSchema),
  scope_version: z.number().int().positive(),
  gauge_requests_per_minute: z.number().int().positive(),
  gauge_requests_per_day: z.number().int().positive(),
  profile_requests_per_minute: z.number().int().positive(),
  profile_requests_per_day: z.number().int().positive(),
})

export const gaugeProfileSchema = z.object({
  gauge_address: z.string(),
  vebtc_token_id: z.string(),
  owner_address: z.string(),
  profile_picture_url: z.string().nullable(),
  description: z.string().nullable(),
  display_name: z.string().nullable(),
  website_url: z.string().nullable(),
  social_links: z.record(z.string(), z.string()).nullable(),
  incentive_strategy: z.string().nullable(),
  voting_strategy: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  is_featured: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const grantRowSchema = z.object({
  id: z.uuid(),
  app_id: z.uuid(),
  wallet_address: z.string(),
  scopes: z.array(apiScopeSchema),
  scope_version: z.number().int().positive(),
  revoked_at: z.iso.datetime().nullable(),
})

export const discordProfileSchema = z.object({
  discord_user_id: z.string(),
  wallet_address: z.string(),
  discord_username: z.string().nullable(),
  discord_global_name: z.string().nullable(),
  discord_avatar: z.string().nullable(),
  verified_at: z.string(),
})

export const authorizationCodeSchema = z.object({
  id: z.uuid(),
  app_id: z.uuid(),
  grant_id: z.uuid(),
  wallet_address: z.string(),
  redirect_uri: z.string(),
  expires_at: z.iso.datetime(),
  consumed_at: z.iso.datetime().nullable(),
})

export const exchangeRequestSchema = z.object({
  code: z.string().min(32).max(256),
  redirectUri: z.url().startsWith("https://"),
})
