import { getAddress } from "viem"

// The gauge registry lives in the flat lib/mezoGauges.ts module, shared with
// the voting UI and detail pages; re-exported here for the measurement layer.
export { MEZO_GAUGES } from "../mezoGauges"

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
