import { type Address, getAddress } from "viem"

export type MezoGaugeProtocol = "Aerodrome" | "Uniswap v4" | "Curve"

export type MezoGaugeNetwork = "base" | "ethereum"

export type MezoGaugeConfig = {
  name: string
  protocol: MezoGaugeProtocol
  network: MezoGaugeNetwork
  tokens: string[]
  poolAddress?: Address
  poolId?: string
  poolUrl: string
  protocolUrl: string
  merklUrl?: string
  merklOpportunityId?: string
}

/**
 * The live MEZO gauges on the veMEZO ThirdPartyVoter, keyed by checksummed
 * gauge address. Nothing on chain distinguishes an admitted gauge from a test
 * one, so this map is the registry.
 */
export const MEZO_GAUGES: Record<Address, MezoGaugeConfig> = {
  [getAddress("0xC7e81dd77A4624F0DD14A8bB97Bc721b0CEE6e26")]: {
    name: "USDC/MUSD",
    protocol: "Aerodrome",
    network: "base",
    tokens: ["USDC", "MUSD"],
    poolAddress: getAddress("0xFF56D037D948faD1027a1AC82ae610e4b694c641"),
    poolUrl:
      "https://aerodrome.finance/vote?filters=all&query=0xFF56D037D948faD1027a1AC82ae610e4b694c641",
    protocolUrl: "https://aerodrome.finance",
  },
  [getAddress("0x4440A9b2954cB98416C0122e2ea996C46555F4B6")]: {
    name: "MEZO/MUSD",
    protocol: "Aerodrome",
    network: "base",
    tokens: ["MEZO", "MUSD"],
    poolAddress: getAddress("0xEF458A3263d2a8C7f3ed9e949aE2F9B345D08b1F"),
    poolUrl:
      "https://aerodrome.finance/vote?filters=all&query=0xEF458A3263d2a8C7f3ed9e949aE2F9B345D08b1F",
    protocolUrl: "https://aerodrome.finance",
  },
  [getAddress("0x2ced96e759ab481210d41c567eee5c42edb59a1d")]: {
    name: "MUSD/USDC",
    protocol: "Uniswap v4",
    network: "ethereum",
    tokens: ["MUSD", "USDC"],
    poolId:
      "0xa9bf5691768ef950a99efd74d722961ff2df3fec08d77ec784432c619bd283a0",
    poolUrl:
      "https://app.uniswap.org/explore/pools/ethereum/0xa9bf5691768ef950a99efd74d722961ff2df3fec08d77ec784432c619bd283a0",
    protocolUrl: "https://app.uniswap.org/",
    merklUrl: "https://app.merkl.xyz/opportunities/17628316464603186847",
    merklOpportunityId: "17628316464603186847",
  },
  [getAddress("0xc39a294024dca62f579c49d7c83a6c831d4976d0")]: {
    name: "MUSD/USDC/USDT",
    protocol: "Curve",
    network: "ethereum",
    tokens: ["MUSD", "USDC", "USDT"],
    poolAddress: getAddress("0xb5571e76693ba60110b5811dd650ffefce1c955f"),
    poolUrl:
      "https://www.curve.finance/dex/ethereum/pools/0xb5571e76693ba60110b5811dd650ffefce1c955f",
    protocolUrl: "https://www.curve.finance/",
    merklUrl: "https://app.merkl.xyz/opportunities/3555713731488585898",
    merklOpportunityId: "3555713731488585898",
  },
}

export const TOKEN_ADDRESSES = {
  musd: getAddress("0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186"),
  usdcBase: getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
  mezoBase: getAddress("0x8e4cbBcc33dB6c0a18561fDE1F6bA35906d4848b"),
} as const

export const MERKL_CREATOR = getAddress(
  "0x6b57b0Ef5594a5820fD473353180442764d8601D",
)

export const THIRD_PARTY_VOTER_SUBGRAPH_ADDRESS =
  "0x2e6d2f2cacc1d24f9f9358030674eb307397a6eb"

/** First vote epoch that counts toward the launch cohort (3 Sep 2026). */
export const LAUNCH_EPOCH_START = 1_788_393_600

/** Vote window closes 1h before the epoch rolls over (Wed 23:00 UTC). */
export const VOTE_WINDOW_CLOSE_OFFSET_SECONDS = 604_800 - 3_600

/**
 * Reference figures captured at 1788787200 (7 Sep 2026 13:20 UTC,
 * block 11686627), the pre-launch baseline. Token amounts are wei decimal
 * strings; USD figures are decimal strings.
 */
export const BASELINE = {
  timestamp: 1_788_787_200,
  blockNumber: 11_686_627,
  totalWeight: "2435249000000000000000000",
  totalVotingPower: "96170000000000000000000000",
  participationBps: "253",
  votingNfts: 11,
  wallets: 6,
  liquidityUsd: {
    curve: "646651",
    uniswapV4: "57848",
    aerodromeUsdcMusd: "1109735",
    aerodromeMezoMusd: "13099",
  },
  aerodromeUsdcMusdComposition: {
    usdc: "82568000000",
    musd: "1037464000000000000000000",
  },
  merkl: {
    distributed: "1349270000000000000000000",
    claimed: "500190000000000000000000",
    claimRateBps: "3707",
  },
  preLaunchLockCreations14d: 42,
} as const

/** Window edges for the pre/post 14-day lock-creation comparison. */
export const BASELINE_PRE14D_FROM = 1_787_577_600
export const BASELINE_POST14D_TO = 1_789_996_800
