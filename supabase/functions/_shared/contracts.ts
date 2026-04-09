// Contract addresses and ABIs for Mezo network
// Used by edge functions for on-chain data fetching

import type { Chain } from "https://esm.sh/viem@2"

export const CHAIN_ID = {
  testnet: 31611,
  mainnet: 31612,
} as const

export const RPC_URLS = {
  testnet: "https://rpc.test.mezo.org",
  mainnet: "https://rpc-http.mezo.boar.network",
} as const

export type SupportedNetwork = keyof typeof RPC_URLS

export const CHAINS: Record<SupportedNetwork, Chain> = {
  testnet: {
    id: CHAIN_ID.testnet,
    name: "Mezo Testnet",
    nativeCurrency: { name: "BTC", symbol: "BTC", decimals: 18 },
    rpcUrls: {
      default: { http: [RPC_URLS.testnet] },
    },
    contracts: {
      multicall3: {
        address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      },
    },
  },
  mainnet: {
    id: CHAIN_ID.mainnet,
    name: "Mezo Mainnet",
    nativeCurrency: { name: "BTC", symbol: "BTC", decimals: 18 },
    rpcUrls: {
      default: { http: [RPC_URLS.mainnet] },
    },
    contracts: {
      multicall3: {
        address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      },
    },
  },
}

export const CONTRACTS = {
  testnet: {
    mezoToken: "0x7B7c000000000000000000000000000000000001",
    veMEZO: "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b",
    veBTC: "0x38E35d92E6Bfc6787272A62345856B13eA12130a",
    boostVoter: "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1",
  },
  mainnet: {
    mezoToken: "0x7B7c000000000000000000000000000000000001",
    veMEZO: "0xb90fdAd3DFD180458D62Cc6acedc983D78E20122",
    veBTC: "0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279",
    boostVoter: "0x2Ba614a598Cffa5a19d683cDCA97bac3a49313d1",
  },
} as const

function getNetworkFromChainId(chainId: number): SupportedNetwork | null {
  if (chainId === CHAIN_ID.testnet) return "testnet"
  if (chainId === CHAIN_ID.mainnet) return "mainnet"
  return null
}

function getNetworkFromRpcUrl(
  rpcUrl: string | undefined,
): SupportedNetwork | null {
  if (!rpcUrl) return null

  if (rpcUrl.includes("rpc.test.mezo.org")) return "testnet"
  if (rpcUrl.includes("rpc.mezo.org")) return "mainnet"
  return null
}

export function getMezoNetworkConfig(options?: {
  chainId?: number | null
  network?: string | null
  rpcUrl?: string | null
}) {
  const requestedNetwork = options?.network?.toLowerCase()
  const envNetwork = Deno.env.get("MEZO_CHAIN")?.toLowerCase()
  const envChainId = Number(Deno.env.get("MEZO_CHAIN_ID"))

  const network =
    (requestedNetwork === "mainnet" || requestedNetwork === "testnet"
      ? requestedNetwork
      : null) ??
    (envNetwork === "mainnet" || envNetwork === "testnet" ? envNetwork : null) ??
    getNetworkFromChainId(options?.chainId ?? NaN) ??
    getNetworkFromChainId(envChainId) ??
    getNetworkFromRpcUrl(options?.rpcUrl ?? undefined) ??
    getNetworkFromRpcUrl(Deno.env.get("MEZO_RPC_URL")) ??
    "mainnet"

  const envRpcUrl = Deno.env.get("MEZO_RPC_URL")
  const envRpcNetwork = getNetworkFromRpcUrl(envRpcUrl)
  const rpcUrl =
    options?.rpcUrl ??
    (envRpcNetwork === null || envRpcNetwork === network
      ? envRpcUrl
      : undefined) ??
    RPC_URLS[network]

  return {
    network,
    rpcUrl,
    chain: CHAINS[network],
    contracts: CONTRACTS[network],
  }
}

// Minimal ABIs for the functions we need
export const BOOST_VOTER_ABI = [
  {
    inputs: [],
    name: "length",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "gauges",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "weights",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "isAlive",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "gaugeToBribe",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "boostableTokenIdToGauge",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "boostableTokenId", type: "uint256" }],
    name: "getBoost",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_timestamp", type: "uint256" }],
    name: "epochStart",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "pure",
    type: "function",
  },
] as const

export const VOTING_ESCROW_ABI = [
  {
    inputs: [{ internalType: "address", name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "_owner", type: "address" },
      { internalType: "uint256", name: "_index", type: "uint256" },
    ],
    name: "ownerToNFTokenIdList",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_tokenId", type: "uint256" }],
    name: "votingPowerOfNFT",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_tokenId", type: "uint256" }],
    name: "locked",
    outputs: [
      { internalType: "int128", name: "amount", type: "int128" },
      { internalType: "uint256", name: "end", type: "uint256" },
      { internalType: "bool", name: "isPermanent", type: "bool" },
      { internalType: "uint256", name: "boost", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const

export const NON_STAKING_GAUGE_ABI = [
  {
    inputs: [],
    name: "rewardsBeneficiary",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const

export const BRIBE_ABI = [
  {
    inputs: [],
    name: "rewardsListLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "rewards",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "epochStart", type: "uint256" },
    ],
    name: "tokenRewardsPerEpoch",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

export const ERC20_ABI = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const
