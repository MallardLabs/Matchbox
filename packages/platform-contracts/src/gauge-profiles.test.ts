import { describe, expect, it } from "vitest"
import {
  type GaugeProfile,
  emptyGaugeProfileChainState,
  gaugeProfileCursorCodec,
  gaugeProfileDetailParamsSchema,
  gaugeProfileListSchema,
  gaugeProfileSchema,
  parseGaugeProfileListQuery,
  sourceMetaFor,
  tagSlug,
  vebtcGaugeProfileParamsSchema,
} from "./gauge-profiles"

const gauge = `0x${"a".repeat(40)}`
const operator = `0x${"b".repeat(40)}`

const boost: GaugeProfile = {
  network: "mezo",
  profileType: "boost-gauge",
  gaugeAddress: gauge,
  vebtcTokenId: "6107",
  displayName: "Auroves",
  description: null,
  avatarUrl: null,
  websiteUrl: "https://example.com",
  socialLinks: { x: "https://x.com/example" },
  tags: ["defi"],
  incentiveStrategy: null,
  votingStrategy: null,
  isFeatured: true,
  chain: {
    isAlive: true,
    nftOwner: operator,
    beneficiary: null,
    poolAddress: null,
    checkedAt: "2026-09-30T10:00:00.000Z",
    blockNumber: "123456789",
  },
  updatedAt: "2026-09-29T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
}

const validator: GaugeProfile = {
  network: "mezo",
  profileType: "validator-gauge",
  gaugeAddress: `0x${"c".repeat(40)}`,
  operatorAddress: operator,
  displayName: null,
  description: null,
  avatarUrl: null,
  websiteUrl: null,
  socialLinks: {},
  tags: [],
  incentiveStrategy: null,
  votingStrategy: null,
  isFeatured: false,
  chain: {
    ...emptyGaugeProfileChainState,
    checkedAt: "2026-09-30T09:00:00+00:00",
    blockNumber: "123456700",
  },
  updatedAt: "2026-09-30T00:00:00.000Z",
  createdAt: "2026-02-01T00:00:00.000Z",
}

describe("gaugeProfileSchema", () => {
  it("accepts both profile types", () => {
    expect(gaugeProfileSchema.parse(boost)).toEqual(boost)
    expect(gaugeProfileSchema.parse(validator)).toEqual(validator)
  })

  it("rejects cross-type fields and upper-case addresses", () => {
    expect(
      gaugeProfileSchema.safeParse({ ...validator, operatorAddress: undefined })
        .success,
    ).toBe(false)
    expect(
      gaugeProfileSchema.safeParse({
        ...boost,
        gaugeAddress: `0x${"A".repeat(40)}`,
      }).success,
    ).toBe(false)
    expect(
      gaugeProfileSchema.safeParse({ ...boost, profileType: "pool" }).success,
    ).toBe(false)
  })

  it("keeps block numbers as decimal strings", () => {
    expect(
      gaugeProfileSchema.safeParse({
        ...boost,
        chain: { ...boost.chain, blockNumber: 123 },
      }).success,
    ).toBe(false)
  })
})

describe("sourceMetaFor", () => {
  it("summarizes freshness across a page", () => {
    expect(sourceMetaFor([boost, validator])).toEqual({
      source: "matchbox-profiles",
      profileUpdatedAt: "2026-09-30T00:00:00.000Z",
      chainCheckedAt: "2026-09-30T09:00:00+00:00",
      chainBlock: "123456700",
    })
  })

  it("handles an empty page", () => {
    const meta = sourceMetaFor([])
    expect(meta).toEqual({
      source: "matchbox-profiles",
      profileUpdatedAt: null,
      chainCheckedAt: null,
      chainBlock: null,
    })
    expect(
      gaugeProfileListSchema.safeParse({ data: [], nextCursor: null, meta })
        .success,
    ).toBe(true)
  })
})

describe("parseGaugeProfileListQuery", () => {
  it("applies defaults", () => {
    const result = parseGaugeProfileListQuery(
      new URLSearchParams("network=mezo"),
    )
    expect(result).toEqual({
      ok: true,
      query: { network: "mezo", limit: 50 },
      cursor: null,
    })
  })

  it("parses repeatable and comma-separated addresses", () => {
    const upper = `0x${"A".repeat(40)}`
    const result = parseGaugeProfileListQuery(
      new URLSearchParams(
        `network=mezo-testnet&address=${upper}&address=${gauge},${operator}&limit=10&profileType=boost-gauge`,
      ),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.query.address).toEqual([
        `0x${"a".repeat(40)}`,
        gauge,
        operator,
      ])
      expect(result.query.limit).toBe(10)
      expect(result.query.profileType).toBe("boost-gauge")
    }
  })

  it("rejects bad parameters", () => {
    for (const query of [
      "",
      "network=ethereum",
      "network=mezo&limit=0",
      "network=mezo&limit=101",
      "network=mezo&limit=1.5",
      "network=mezo&address=0x123",
      "network=mezo&profileType=pool",
      "network=mezo&updatedSince=yesterday",
      `network=mezo&${Array.from({ length: 51 }, () => `address=${gauge}`).join("&")}`,
      // Tags feed a PostgREST array filter: slugs only.
      "network=mezo&tag=a,b",
      "network=mezo&tag=%7D",
      "network=mezo&tag=%22x%22",
      "network=mezo&tag=DeFi",
      "network=mezo&tag=-x",
      `network=mezo&tag=${"a".repeat(41)}`,
    ]) {
      expect(parseGaugeProfileListQuery(new URLSearchParams(query)).ok).toBe(
        false,
      )
    }
  })

  it("accepts slug tags", () => {
    const result = parseGaugeProfileListQuery(
      new URLSearchParams("network=mezo&tag=%20defi-2%20"),
    )
    expect(result.ok && result.query.tag).toBe("defi-2")
  })

  it("decodes cursors and rejects tampered ones", () => {
    const cursor = gaugeProfileCursorCodec.encode({
      v: 1,
      updatedAt: "2026-09-30T00:00:00.000Z",
      gaugeAddress: gauge,
    })
    const ok = parseGaugeProfileListQuery(
      new URLSearchParams({ network: "mezo", cursor }),
    )
    expect(ok).toMatchObject({
      ok: true,
      cursor: { updatedAt: "2026-09-30T00:00:00.000Z", gaugeAddress: gauge },
    })
    expect(
      parseGaugeProfileListQuery(
        new URLSearchParams({ network: "mezo", cursor: "garbage" }),
      ),
    ).toEqual({ ok: false, error: "invalid-cursor" })
  })
})

describe("path params", () => {
  it("normalizes gauge addresses", () => {
    expect(
      gaugeProfileDetailParamsSchema.parse({
        network: "mezo",
        gaugeAddress: `0x${"F".repeat(40)}`,
      }).gaugeAddress,
    ).toBe(`0x${"f".repeat(40)}`)
  })

  it("validates token ids", () => {
    expect(
      vebtcGaugeProfileParamsSchema.safeParse({
        network: "mezo",
        tokenId: "6107",
      }).success,
    ).toBe(true)
    for (const tokenId of ["", "-1", "01", "1e3", "abc"]) {
      expect(
        vebtcGaugeProfileParamsSchema.safeParse({ network: "mezo", tokenId })
          .success,
      ).toBe(false)
    }
  })
})

describe("tagSlug", () => {
  it("slugs free-text profile tags for case-insensitive filtering", () => {
    expect(tagSlug("DeFi")).toBe("defi")
    expect(tagSlug("  Long Term / Yield ")).toBe("long-term-yield")
    expect(tagSlug("already-slugged")).toBe("already-slugged")
    expect(tagSlug("---")).toBe("")
  })
})
