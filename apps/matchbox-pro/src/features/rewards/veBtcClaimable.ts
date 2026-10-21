import { chunkArray } from "@/lib/chunk"
import {
  CHAIN_ID,
  CONTRACTS,
  type SupportedChainId,
} from "@repo/shared/contracts"
import {
  type Abi,
  type Address,
  type PublicClient,
  getAddress,
  isAddress,
  parseAbi,
  zeroAddress,
} from "viem"
import type { ClaimSourceKind, RewardRow } from "./claimSources"

// veBTC voter-side rewards, read on chain (the Earn API omits validator
// bribes). Pools: PoolsVoter.pools(i) → gauges(pool) → gaugeToFees and
// gaugeToBribe. Validators: ValidatorsVoter.gauges(i) → gaugeToBribe, killed
// gauges included since they can still hold bribes.

export const POOLS_VOTER_CLAIM_ABI = parseAbi([
  "function length() view returns (uint256)",
  "function pools(uint256) view returns (address)",
  "function gauges(address) view returns (address)",
  "function gaugeToFees(address) view returns (address)",
  "function gaugeToBribe(address) view returns (address)",
  "function claimFeesAndBribes(address[] _rewards, address[][] _tokens, uint256 _tokenId)",
])

export const VALIDATORS_VOTER_CLAIM_ABI = parseAbi([
  "function length() view returns (uint256)",
  "function gauges(uint256) view returns (address)",
  "function gaugeToBribe(address) view returns (address)",
  "function claimBribes(address[] _bribes, address[][] _tokens, uint256 _tokenId)",
])

const REWARD_ABI = parseAbi([
  "function rewardsListLength() view returns (uint256)",
  "function rewards(uint256) view returns (address)",
  "function earned(address token, uint256 tokenId) view returns (uint256)",
])

const TOKEN_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
])

// Reward-token lists are short; cap the scan so a bad contract can't explode it.
const MAX_REWARD_TOKENS = 8
const BATCH = 200

export function veBtcVoters(chainId: SupportedChainId): {
  pools: Address
  validators: Address
} {
  const addresses =
    chainId === CHAIN_ID.testnet ? CONTRACTS.testnet : CONTRACTS.mainnet
  return { pools: addresses.poolsVoter, validators: addresses.validatorsVoter }
}

function asAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    return null
  }
  const address = getAddress(value)
  return address === zeroAddress ? null : address
}

type Call = {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

async function readAll(
  client: PublicClient,
  calls: Call[],
): Promise<Array<unknown | null>> {
  const results: Array<unknown | null> = []
  for (const batch of chunkArray(calls, BATCH)) {
    // The batch mixes ABIs; each result is type-checked by the caller.
    const out = await client.multicall({ contracts: batch, allowFailure: true })
    for (const row of out) {
      results.push(row.status === "success" ? row.result : null)
    }
  }
  return results
}

type RewardContract = {
  kind: ClaimSourceKind
  gauge: Address
  address: Address
}

export type VeBtcRead = {
  rows: RewardRow[]
  /** earned() reads that failed: the totals are a lower bound. */
  failed: number
}

/**
 * Unclaimed veBTC pool and validator rewards for the given locks. USD is left
 * null here; the caller prices tokens with the live reference prices.
 */
export async function readVeBtcClaimables(
  client: PublicClient,
  chainId: SupportedChainId,
  tokenIds: bigint[],
): Promise<VeBtcRead> {
  if (tokenIds.length === 0) return { rows: [], failed: 0 }
  const voters = veBtcVoters(chainId)

  const [poolCount, gaugeCount] = await readAll(client, [
    {
      address: voters.pools,
      abi: POOLS_VOTER_CLAIM_ABI,
      functionName: "length",
    },
    {
      address: voters.validators,
      abi: VALIDATORS_VOTER_CLAIM_ABI,
      functionName: "length",
    },
  ])
  const pools = typeof poolCount === "bigint" ? Number(poolCount) : 0
  const validators = typeof gaugeCount === "bigint" ? Number(gaugeCount) : 0

  const listed = await readAll(client, [
    ...Array.from({ length: pools }, (_, i) => ({
      address: voters.pools,
      abi: POOLS_VOTER_CLAIM_ABI,
      functionName: "pools",
      args: [BigInt(i)],
    })),
    ...Array.from({ length: validators }, (_, i) => ({
      address: voters.validators,
      abi: VALIDATORS_VOTER_CLAIM_ABI,
      functionName: "gauges",
      args: [BigInt(i)],
    })),
  ])
  const poolTargets = listed
    .slice(0, pools)
    .flatMap((value) => asAddress(value) ?? [])
  const validatorGauges = listed
    .slice(pools)
    .flatMap((value) => asAddress(value) ?? [])

  const poolGauges = (
    await readAll(
      client,
      poolTargets.map((pool) => ({
        address: voters.pools,
        abi: POOLS_VOTER_CLAIM_ABI,
        functionName: "gauges",
        args: [pool],
      })),
    )
  ).flatMap((value) => asAddress(value) ?? [])

  const rewardLookups = await readAll(client, [
    ...poolGauges.flatMap((gauge) => [
      {
        address: voters.pools,
        abi: POOLS_VOTER_CLAIM_ABI,
        functionName: "gaugeToFees",
        args: [gauge],
      },
      {
        address: voters.pools,
        abi: POOLS_VOTER_CLAIM_ABI,
        functionName: "gaugeToBribe",
        args: [gauge],
      },
    ]),
    ...validatorGauges.map((gauge) => ({
      address: voters.validators,
      abi: VALIDATORS_VOTER_CLAIM_ABI,
      functionName: "gaugeToBribe",
      args: [gauge],
    })),
  ])
  const contracts: RewardContract[] = []
  poolGauges.forEach((gauge, i) => {
    for (const value of [rewardLookups[i * 2], rewardLookups[i * 2 + 1]]) {
      const address = asAddress(value)
      if (address) contracts.push({ kind: "pool-rewards", gauge, address })
    }
  })
  validatorGauges.forEach((gauge, i) => {
    const address = asAddress(rewardLookups[poolGauges.length * 2 + i])
    if (address) contracts.push({ kind: "validator-bribes", gauge, address })
  })

  const lengths = await readAll(
    client,
    contracts.map((contract) => ({
      address: contract.address,
      abi: REWARD_ABI,
      functionName: "rewardsListLength",
    })),
  )
  const tokenCalls: Array<{ contract: number; call: Call }> = []
  contracts.forEach((contract, index) => {
    const length = lengths[index]
    const count =
      typeof length === "bigint"
        ? Math.min(Number(length), MAX_REWARD_TOKENS)
        : 0
    for (let i = 0; i < count; i += 1) {
      tokenCalls.push({
        contract: index,
        call: {
          address: contract.address,
          abi: REWARD_ABI,
          functionName: "rewards",
          args: [BigInt(i)],
        },
      })
    }
  })
  const tokenValues = await readAll(
    client,
    tokenCalls.map((item) => item.call),
  )
  const tokensByContract = contracts.map(() => [] as Address[])
  tokenCalls.forEach((item, i) => {
    const token = asAddress(tokenValues[i])
    if (token) tokensByContract[item.contract]?.push(token)
  })

  const uniqueTokens = Array.from(new Set(tokensByContract.flat()))
  const meta = await readAll(
    client,
    uniqueTokens.flatMap((token) => [
      { address: token, abi: TOKEN_ABI, functionName: "symbol" },
      { address: token, abi: TOKEN_ABI, functionName: "decimals" },
    ]),
  )
  const tokenMeta = new Map<string, { symbol: string; decimals: number }>()
  uniqueTokens.forEach((token, i) => {
    const symbol = meta[i * 2]
    const decimals = meta[i * 2 + 1]
    tokenMeta.set(token, {
      symbol: typeof symbol === "string" && symbol !== "" ? symbol : "Unknown",
      decimals: typeof decimals === "number" ? decimals : 18,
    })
  })

  const earnedCalls: Array<{
    contract: number
    tokenId: bigint
    token: Address
  }> = []
  contracts.forEach((_, index) => {
    for (const token of tokensByContract[index] ?? []) {
      for (const tokenId of tokenIds) {
        earnedCalls.push({ contract: index, tokenId, token })
      }
    }
  })
  const earned = await readAll(
    client,
    earnedCalls.map((item) => ({
      address: contracts[item.contract]?.address ?? zeroAddress,
      abi: REWARD_ABI,
      functionName: "earned",
      args: [item.token, item.tokenId],
    })),
  )

  let failed = 0
  const rows = new Map<string, RewardRow>()
  earnedCalls.forEach((item, i) => {
    const value = earned[i]
    if (typeof value !== "bigint") {
      failed += 1
      return
    }
    if (value === 0n) return
    const contract = contracts[item.contract]
    if (!contract) return
    const key = `${contract.address}:${item.tokenId}`
    const row = rows.get(key) ?? {
      kind: contract.kind,
      tokenId: item.tokenId,
      gauge: contract.gauge,
      rewardContract: contract.address,
      tokens: [],
    }
    const info = tokenMeta.get(item.token) ?? {
      symbol: "Unknown",
      decimals: 18,
    }
    row.tokens.push({
      token: item.token,
      symbol: info.symbol,
      decimals: info.decimals,
      amount: value,
      usdMicro: null,
    })
    rows.set(key, row)
  })

  return { rows: Array.from(rows.values()), failed }
}
