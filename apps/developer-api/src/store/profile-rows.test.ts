import { describe, expect, it } from "vitest"
import {
  chainStateFromRow,
  chainStateRowSchema,
  profileFromRow,
  profileViewRowSchema,
} from "./profile-rows"

const baseRow = {
  network: "mezo",
  profile_type: "boost-gauge",
  gauge_address: "0x5A1C4F0E7B9D3E2A8C6F1B0D9E8A7C6B5F4E3D2C",
  vebtc_token_id: "1042",
  operator_address: null,
  display_name: "Gauge",
  description: null,
  avatar_url: null,
  website_url: null,
  social_links: null,
  tags: null,
  incentive_strategy: null,
  voting_strategy: null,
  is_featured: null,
  created_at: "2026-07-02T10:00:00.123456+00:00",
  updated_at: "2026-09-29T18:30:00.654321+00:00",
}

describe("profile rows", () => {
  it("tolerates nullable JSONB, tags and is_featured", () => {
    const row = profileViewRowSchema.parse(baseRow)
    const mapped = profileFromRow(row, chainStateFromRow(undefined))
    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.profile).toMatchObject({
        profileType: "boost-gauge",
        gaugeAddress: "0x5a1c4f0e7b9d3e2a8c6f1b0d9e8a7c6b5f4e3d2c",
        socialLinks: {},
        tags: [],
        isFeatured: false,
        updatedAt: "2026-09-29T18:30:00.654321+00:00",
        chain: { isAlive: null, blockNumber: null },
      })
    }
  })

  it("keeps only string social links", () => {
    const row = profileViewRowSchema.parse({
      ...baseRow,
      social_links: { x: "https://x.com/a", count: 3, empty: "" },
    })
    expect(row.social_links).toEqual({ x: "https://x.com/a" })
  })

  it("rejects a validator row without an operator", () => {
    const row = profileViewRowSchema.parse({
      ...baseRow,
      profile_type: "validator-gauge",
      vebtc_token_id: null,
    })
    expect(profileFromRow(row, chainStateFromRow(undefined)).ok).toBe(false)
  })

  it("maps chain state with a decimal block number", () => {
    const state = chainStateFromRow(
      chainStateRowSchema.parse({
        network: "mezo",
        gauge_address: "0x5a1c4f0e7b9d3e2a8c6f1b0d9e8a7c6b5f4e3d2c",
        is_alive: true,
        vebtc_token_id: "1042",
        nft_owner: "0x9f2b1e4d7c0a3b6e5d8c1f4a7b0e3d6c9f2a5b8e",
        beneficiary: null,
        pool_address: null,
        checked_at: "2026-09-30T09:50:00+00:00",
        block_number: "4815162",
      }),
    )
    expect(state).toEqual({
      isAlive: true,
      nftOwner: "0x9f2b1e4d7c0a3b6e5d8c1f4a7b0e3d6c9f2a5b8e",
      beneficiary: null,
      poolAddress: null,
      checkedAt: "2026-09-30T09:50:00+00:00",
      blockNumber: "4815162",
    })
  })
})
