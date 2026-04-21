import {
  BOOST_VOTER_ABI,
  BRIBE_ABI,
  CHAIN_ID,
  CONTRACTS,
  ERC20_ABI,
  POOLS_VOTER_ABI,
  type SupportedChainId,
  VOTING_ESCROW_ABI,
} from "@repo/shared/contracts"

export function getContractConfig(
  chainId: SupportedChainId = CHAIN_ID.testnet,
) {
  const addresses =
    chainId === CHAIN_ID.testnet ? CONTRACTS.testnet : CONTRACTS.mainnet

  return {
    mezoToken: {
      address: addresses.mezoToken,
      abi: ERC20_ABI,
      chainId,
    },
    veMEZO: {
      address: addresses.veMEZO,
      abi: VOTING_ESCROW_ABI,
      chainId,
    },
    veBTC: {
      address: addresses.veBTC,
      abi: VOTING_ESCROW_ABI,
      chainId,
    },
    boostVoter: {
      address: addresses.boostVoter,
      abi: BOOST_VOTER_ABI,
      chainId,
    },
    poolsVoter: {
      address: addresses.poolsVoter,
      abi: POOLS_VOTER_ABI,
      chainId,
    },
    bribe: {
      abi: BRIBE_ABI,
      chainId,
    },
    gaugeFactory: {
      address: addresses.gaugeFactory,
      chainId,
    },
  }
}
