import {
  CHAIN_ID,
  CONTRACTS,
  type SupportedChainId,
} from "@repo/shared/contracts"
import { type Address, parseAbi } from "viem"
import type { VoteType } from "./model"

// One ABI for all three voters. BoostVoter and ValidatorsVoter are
// NonPoolsVoters (gauge targets, `gaugeVote` list); PoolsVoter votes on pool
// and vault addresses and lists them with `poolVote`. The custom errors let
// viem name a revert ("AlreadyVotedOrDeposited") instead of returning hex.
export const VOTER_ABI = parseAbi([
  "function length() view returns (uint256)",
  "function gauges(uint256 index) view returns (address)",
  "function gauges(address pool) view returns (address)",
  "function pools(uint256 index) view returns (address)",
  "function weights(address target) view returns (uint256)",
  "function isAlive(address gauge) view returns (bool)",
  "function gaugeToBribe(address gauge) view returns (address)",
  "function gaugeToFees(address gauge) view returns (address)",
  "function totalWeight() view returns (uint256)",
  "function lastVoted(uint256 tokenId) view returns (uint256)",
  "function usedWeights(uint256 tokenId) view returns (uint256)",
  "function votes(uint256 tokenId, address target) view returns (uint256)",
  "function gaugeVote(uint256 tokenId, uint256 index) view returns (address)",
  "function poolVote(uint256 tokenId, uint256 index) view returns (address)",
  "function maxVotingNum() view returns (uint256)",
  "function validatorToGauge(address operator) view returns (address)",
  "function vote(uint256 tokenId, address[] targets, uint256[] weights)",
  "error AlreadyVotedOrDeposited()",
  "error DistributeWindow()",
  "error NotWhitelistedNFT()",
  "error ZeroBalance()",
  "error TooManyGauges()",
  "error TooManyPools()",
  "error NonZeroVotes()",
  "error GaugeNotAlive(address gauge)",
  "error GaugeDoesNotExist(address target)",
  "error InactiveManagedNFT()",
  "error NotApprovedOrOwner()",
])

export const REWARD_ABI = parseAbi([
  "function rewardsListLength() view returns (uint256)",
  "function rewards(uint256 index) view returns (address)",
  "function tokenRewardsPerEpoch(address token, uint256 epochStart) view returns (uint256)",
])

export const TOKEN_META_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
])

export const ESCROW_EXTRA_ABI = parseAbi([
  "function idToManaged(uint256 tokenId) view returns (uint256)",
])

/** Velodrome-lineage cap on targets per vote; 30 on every Mezo voter. */
export const MAX_VOTING_TARGETS = 30

/** Read-only scan bound for `gaugeVote` / `poolVote` (they revert past the end). */
export const VOTE_LIST_SCAN = MAX_VOTING_TARGETS

export type VoterConfig = {
  address: Address
  abi: typeof VOTER_ABI
  chainId: SupportedChainId
  listFunction: "gaugeVote" | "poolVote"
}

export function voterConfig(
  chainId: SupportedChainId,
  type: VoteType,
): VoterConfig {
  const addresses =
    chainId === CHAIN_ID.testnet ? CONTRACTS.testnet : CONTRACTS.mainnet
  const address =
    type === "vemezo"
      ? addresses.boostVoter
      : type === "validators"
        ? addresses.validatorsVoter
        : addresses.poolsVoter
  return {
    address,
    abi: VOTER_ABI,
    chainId,
    listFunction: type === "pools" ? "poolVote" : "gaugeVote",
  }
}

export function validatorPoolAddress(chainId: SupportedChainId): Address {
  return chainId === CHAIN_ID.testnet
    ? CONTRACTS.testnet.validatorPool
    : CONTRACTS.mainnet.validatorPool
}
