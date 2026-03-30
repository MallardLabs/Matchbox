// Contract addresses and ABIs for Mezo network
// Used by edge functions for on-chain data fetching

export const CHAIN_ID = {
  testnet: 31612,
  mainnet: 31611,
} as const

export const RPC_URLS = {
  testnet: "https://rpc.test.mezo.org",
  mainnet: "https://rpc.mezo.org",
} as const

export const CONTRACTS = {
  testnet: {
    mezoToken: "0x7B7c000000000000000000000000000000000001",
    veMEZO: "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b",
    veBTC: "0x38E35d92E6Bfc6787272A62345856B13eA12130a",
    boostVoter: "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1",
  },
  mainnet: {
    mezoToken: "0x7B7c000000000000000000000000000000000001",
    veMEZO: undefined,
    veBTC: undefined,
    boostVoter: undefined,
  },
} as const

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

