import {
  type ApiKeyKind,
  formatApiKey,
} from "@repo/platform-contracts/credentials"
import {
  type GaugeProfile,
  emptyGaugeProfileChainState,
} from "@repo/platform-contracts/gauge-profiles"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import type { MemoryStoreSeed } from "./memory-store"

/**
 * Fixed sample data for `PLATFORM_STORE=memory`. The plaintext keys are
 * deterministic and public — memory mode is refused in production, and these
 * keys never exist in Supabase. Print them with `pnpm dev:seed-keys`.
 */

function devKey(
  kind: ApiKeyKind,
  environmentKind: EnvironmentKind,
  prefix: string,
  label: string,
): string {
  return formatApiKey({
    kind,
    environmentKind,
    prefix,
    secret: `${label}${"0".repeat(43)}`.slice(0, 43),
  })
}

export const devApiKeys = {
  testPublishable: devKey(
    "publishable",
    "test",
    "DevTestPk001",
    "memoryModeTestPublishable",
  ),
  testSecret: devKey("secret", "test", "DevTestSk001", "memoryModeTestSecret"),
  livePublishable: devKey(
    "publishable",
    "live",
    "DevLivePk001",
    "memoryModeLivePublishable",
  ),
  liveSecret: devKey("secret", "live", "DevLiveSk001", "memoryModeLiveSecret"),
} as const

export const devOrigins = {
  test: ["http://localhost:3000", "http://localhost:5173"],
  live: ["https://sandbox.matchbox.markets"],
} as const

const checkedAt = "2026-09-30T09:50:00.000Z"

const sampleProfiles: GaugeProfile[] = [
  {
    profileType: "boost-gauge",
    vebtcTokenId: "1042",
    network: "mezo",
    gaugeAddress: "0x5a1c4f0e7b9d3e2a8c6f1b0d9e8a7c6b5f4e3d2c",
    displayName: "Satoshi Street Capital",
    description: "Long-term veBTC lock voting for deep MUSD liquidity.",
    avatarUrl: "https://assets.matchbox.markets/samples/satoshi-street.png",
    websiteUrl: "https://satoshistreet.example",
    socialLinks: { x: "https://x.com/satoshistreet" },
    tags: ["liquidity", "long-term"],
    incentiveStrategy: "Weekly MEZO incentives matched to votes.",
    votingStrategy: "Votes the top three MUSD pools by volume.",
    isFeatured: true,
    chain: {
      isAlive: true,
      nftOwner: "0x9f2b1e4d7c0a3b6e5d8c1f4a7b0e3d6c9f2a5b8e",
      beneficiary: "0x9f2b1e4d7c0a3b6e5d8c1f4a7b0e3d6c9f2a5b8e",
      poolAddress: null,
      checkedAt,
      blockNumber: "4815162",
    },
    updatedAt: "2026-09-29T18:30:00.000Z",
    createdAt: "2026-07-02T10:00:00.000Z",
  },
  {
    profileType: "boost-gauge",
    vebtcTokenId: "2077",
    network: "mezo",
    gaugeAddress: "0x7e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d",
    displayName: "Orange Pill Treasury",
    description: null,
    avatarUrl: null,
    websiteUrl: "https://orangepill.example",
    socialLinks: {},
    tags: ["Treasury"],
    incentiveStrategy: null,
    votingStrategy: "Rotates votes monthly.",
    isFeatured: false,
    chain: {
      isAlive: true,
      nftOwner: "0x1d4c7b0a3f6e9d2c5b8a1f4e7d0c3b6a9f2e5d8c",
      beneficiary: "0x1d4c7b0a3f6e9d2c5b8a1f4e7d0c3b6a9f2e5d8c",
      poolAddress: null,
      checkedAt,
      blockNumber: "4815162",
    },
    updatedAt: "2026-09-27T08:15:00.000Z",
    createdAt: "2026-08-11T16:45:00.000Z",
  },
  {
    profileType: "validator-gauge",
    operatorAddress: "0x3c6f9e2d5a8b1c4f7e0d3a6b9c2f5e8d1a4b7c0e",
    network: "mezo",
    gaugeAddress: "0x2b5e8d1a4c7f0e3b6d9a2c5f8e1b4d7a0c3f6e9b",
    displayName: "Boar Validator",
    description: "Mezo mainnet validator with 99.9% uptime.",
    avatarUrl: "https://assets.matchbox.markets/samples/boar.png",
    websiteUrl: "https://boar.example",
    socialLinks: { discord: "https://discord.gg/boar" },
    tags: ["validator", "infrastructure"],
    incentiveStrategy: "Shares 50% of commission as incentives.",
    votingStrategy: null,
    isFeatured: true,
    chain: {
      isAlive: true,
      nftOwner: null,
      beneficiary: "0x3c6f9e2d5a8b1c4f7e0d3a6b9c2f5e8d1a4b7c0e",
      poolAddress: null,
      checkedAt,
      blockNumber: "4815162",
    },
    updatedAt: "2026-09-28T12:00:00.000Z",
    createdAt: "2026-07-16T09:00:00.000Z",
  },
  {
    profileType: "boost-gauge",
    vebtcTokenId: "17",
    network: "mezo-testnet",
    gaugeAddress: "0x4d7a0c3f6e9b2d5a8c1f4e7b0d3a6c9f2e5b8d1a",
    displayName: "Testnet Boost Desk",
    description: "Sandbox boost gauge for integration tests.",
    avatarUrl: null,
    websiteUrl: null,
    socialLinks: {},
    tags: ["sandbox"],
    incentiveStrategy: null,
    votingStrategy: null,
    isFeatured: false,
    chain: emptyGaugeProfileChainState,
    updatedAt: "2026-09-29T07:00:00.000Z",
    createdAt: "2026-09-01T07:00:00.000Z",
  },
  {
    profileType: "validator-gauge",
    operatorAddress: "0x6b9c2f5e8d1a4b7c0e3f6a9d2c5b8e1f4a7d0c3b",
    network: "mezo-testnet",
    gaugeAddress: "0x8e1b4d7a0c3f6e9b2d5a8c1f4e7b0d3a6c9f2e5b",
    displayName: "Testnet Validator One",
    description: null,
    avatarUrl: null,
    websiteUrl: null,
    socialLinks: {},
    tags: ["validator", "sandbox"],
    incentiveStrategy: null,
    votingStrategy: null,
    isFeatured: false,
    chain: {
      isAlive: false,
      nftOwner: null,
      beneficiary: null,
      poolAddress: null,
      checkedAt,
      blockNumber: "912345",
    },
    updatedAt: "2026-09-26T21:10:00.000Z",
    createdAt: "2026-09-02T11:30:00.000Z",
  },
]

export const defaultMemorySeed: MemoryStoreSeed = {
  apps: [{ id: "00000000-0000-4000-8000-00000000a001", status: "active" }],
  environments: [
    {
      id: "00000000-0000-4000-8000-00000000e001",
      appId: "00000000-0000-4000-8000-00000000a001",
      kind: "test",
      network: "mezo-testnet",
      reviewState: "development",
      approvedScopes: [],
      origins: [...devOrigins.test],
    },
    {
      id: "00000000-0000-4000-8000-00000000e002",
      appId: "00000000-0000-4000-8000-00000000a001",
      kind: "live",
      network: "mezo",
      reviewState: "approved",
      approvedScopes: ["gauge-profiles:read"],
      origins: [...devOrigins.live],
    },
  ],
  apiKeys: [
    {
      id: "00000000-0000-4000-8000-00000000c001",
      environmentId: "00000000-0000-4000-8000-00000000e001",
      kind: "publishable",
      value: devApiKeys.testPublishable,
      allowedCidrs: [],
      expiresAt: null,
      revokedAt: null,
    },
    {
      id: "00000000-0000-4000-8000-00000000c002",
      environmentId: "00000000-0000-4000-8000-00000000e001",
      kind: "secret",
      value: devApiKeys.testSecret,
      allowedCidrs: [],
      expiresAt: null,
      revokedAt: null,
    },
    {
      id: "00000000-0000-4000-8000-00000000c003",
      environmentId: "00000000-0000-4000-8000-00000000e002",
      kind: "publishable",
      value: devApiKeys.livePublishable,
      allowedCidrs: [],
      expiresAt: null,
      revokedAt: null,
    },
    {
      id: "00000000-0000-4000-8000-00000000c004",
      environmentId: "00000000-0000-4000-8000-00000000e002",
      kind: "secret",
      value: devApiKeys.liveSecret,
      allowedCidrs: [],
      expiresAt: null,
      revokedAt: null,
    },
  ],
  profiles: sampleProfiles,
  vebtcTokens: [
    {
      network: "mezo",
      tokenId: "1042",
      gaugeAddress: "0x5a1c4f0e7b9d3e2a8c6f1b0d9e8a7c6b5f4e3d2c",
    },
  ],
  quotaOverrides: [],
}
