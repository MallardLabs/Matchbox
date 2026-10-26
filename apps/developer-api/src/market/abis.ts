import { THIRD_PARTY_VOTER_ABI } from "@repo/shared/contracts"

/**
 * ThirdPartyVoter is a NonStakingVoter like BoostVoter, so it lists its
 * gauges with `length()` / `gauges(i)`; the shared ABI leaves those out.
 */
export const THIRD_PARTY_VOTER_READ_ABI = [
  ...THIRD_PARTY_VOTER_ABI,
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
] as const
