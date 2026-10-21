import { useEpoch } from "@/hooks/useEpoch"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import {
  BOOST_VOTER_ABI,
  CHAIN_ID,
  CONTRACTS,
  POOLS_VOTER_ABI,
  THIRD_PARTY_VOTER_ABI,
  VALIDATORS_VOTER_ABI,
} from "@repo/shared/contracts"
import type { Abi, Address } from "viem"
import { useReadContracts } from "wagmi"
import {
  type LockView,
  type ResetPlan,
  VOTERS_FOR,
  type VoterId,
  resetPlan,
} from "./lockModel"

export type VoterContract = { address: Address; abi: Abi }

export function voterContract(voter: VoterId, chainId: number): VoterContract {
  const addresses =
    chainId === CHAIN_ID.testnet ? CONTRACTS.testnet : CONTRACTS.mainnet
  switch (voter) {
    case "boost":
      return { address: addresses.boostVoter, abi: BOOST_VOTER_ABI }
    case "third-party":
      return { address: addresses.thirdPartyVoter, abi: THIRD_PARTY_VOTER_ABI }
    case "pools":
      return { address: addresses.poolsVoter, abi: POOLS_VOTER_ABI }
    case "validators":
      return { address: addresses.validatorsVoter, abi: VALIDATORS_VOTER_ABI }
  }
}

/** Which voters must `reset` a lock before it can be withdrawn. */
export function useResetPlan(lock: LockView): ResetPlan {
  const { chainId } = useNetwork()
  const { epochStart } = useEpoch()
  const voters = VOTERS_FOR[lock.kind]
  const enabled = lock.hasActiveVotes === true

  const reads = useReadContracts({
    contracts: voters.flatMap((voter) => {
      const contract = voterContract(voter, chainId)
      return [
        {
          ...contract,
          functionName: "usedWeights",
          args: [lock.tokenId],
        },
        {
          ...contract,
          functionName: "lastVoted",
          args: [lock.tokenId],
        },
      ]
    }),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled },
  })

  if (!enabled) return { status: "ready", resets: [], blockedBy: [] }
  return resetPlan(
    voters.map((voter, index) => {
      const used = reads.data?.[index * 2]?.result
      const last = reads.data?.[index * 2 + 1]?.result
      return {
        voter,
        usedWeights: typeof used === "bigint" ? used : undefined,
        lastVoted: typeof last === "bigint" ? last : undefined,
      }
    }),
    epochStart,
  )
}
