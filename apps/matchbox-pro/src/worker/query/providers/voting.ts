import type { Address, ContractFunctionParameters } from "viem"
import { z } from "zod"
import type { VoteBranch } from "../../../features/query/contract"
import { cached } from "../../router"
import { computeGaugeTopology } from "../../topology"
import { shortAddress } from "../format"
import {
  ERC20_ABI,
  ESCROW_ABI,
  MAINNET,
  POOLS_VOTER_GAUGE_ABI,
  REWARD_ABI,
  VALIDATORS_VOTER_EXTRA_ABI,
  VALIDATOR_POOL_ABI,
  VOTER_ABI,
  ZERO_ADDRESS,
} from "./abis"
import type { GaugeProfileName } from "./profiles"
import {
  type MezoClient,
  addressSchema,
  bigintSchema,
  boolSchema,
  multicallParsed,
  numberSchema,
  stringSchema,
} from "./rpc"

export const EPOCH_SECONDS = 604_800n
export const MAX_VOTING_NUM = 30

export type IncentiveToken = {
  contract: Address
  token: Address
  symbol: string
  decimals: number
  amount: bigint
}

export type VoteTarget = {
  // Gauge (boost, validators) or pool/vault (pools): what `vote()` takes.
  targetAddress: Address
  gaugeAddress: Address
  name: string
  nameSource: "profile" | "derived"
  tokenId: string | null
  isAlive: boolean
  weight: bigint
  rewardContracts: Address[]
  incentives: IncentiveToken[]
}

export type VotingDomain = {
  branch: VoteBranch
  voter: Address
  governanceAsset: "veMEZO" | "veBTC"
  epochStart: bigint
  epochNext: bigint
  blockNumber: bigint
  fetchedAt: string
  totalWeight: bigint
  maxVotingNum: number
  source: string
  targets: VoteTarget[]
}

export type WalletLock = {
  asset: "veMEZO" | "veBTC"
  tokenId: bigint
  amount: bigint
  end: bigint
  isPermanent: boolean
  votingPower: bigint
}

export type LockVoteState = {
  tokenId: bigint
  lastVoted: bigint
  usedWeight: bigint
  votes: Map<string, bigint>
}

export function voterFor(branch: VoteBranch): Address {
  if (branch === "boost") return MAINNET.boostVoter
  if (branch === "validators") return MAINNET.validatorsVoter
  return MAINNET.poolsVoter
}

export function assetFor(branch: VoteBranch): "veMEZO" | "veBTC" {
  return branch === "boost" ? "veMEZO" : "veBTC"
}

function escrowFor(asset: "veMEZO" | "veBTC"): Address {
  return asset === "veMEZO" ? MAINNET.veMEZO : MAINNET.veBTC
}

const lockedSchema = z.object({
  amount: z.bigint(),
  end: z.bigint(),
  isPermanent: z.boolean(),
})

function live(addresses: Array<Address | null>): Address[] {
  return addresses.filter(
    (value): value is Address => value !== null && value !== ZERO_ADDRESS,
  )
}

/** rewardsListLength → rewards(i) → metadata → tokenRewardsPerEpoch(epoch). */
export async function readRewardIncentives(
  client: MezoClient,
  contracts: readonly Address[],
  epochStart: bigint,
): Promise<Map<string, IncentiveToken[]>> {
  const unique = [...new Set(contracts.map((value) => value.toLowerCase()))]
    .map((value) => contracts.find((item) => item.toLowerCase() === value))
    .filter((value): value is Address => value !== undefined)
  const lengths = await multicallParsed(
    client,
    unique.map(
      (address): ContractFunctionParameters => ({
        address,
        abi: REWARD_ABI,
        functionName: "rewardsListLength",
      }),
    ),
    bigintSchema,
  )
  const tokenQueries = unique.flatMap((contract, index) =>
    Array.from({ length: Number(lengths[index] ?? 0n) }, (_, rewardIndex) => ({
      contract,
      rewardIndex,
    })),
  )
  const tokens = await multicallParsed(
    client,
    tokenQueries.map(
      (query): ContractFunctionParameters => ({
        address: query.contract,
        abi: REWARD_ABI,
        functionName: "rewards",
        args: [BigInt(query.rewardIndex)],
      }),
    ),
    addressSchema,
  )
  const pairs = tokenQueries.flatMap((query, index) => {
    const token = tokens[index]
    return token && token !== ZERO_ADDRESS
      ? [{ contract: query.contract, token }]
      : []
  })
  const uniqueTokens = [...new Set(pairs.map((pair) => pair.token))]
  const [symbols, decimals, amounts] = await Promise.all([
    multicallParsed(
      client,
      uniqueTokens.map(
        (address): ContractFunctionParameters => ({
          address,
          abi: ERC20_ABI,
          functionName: "symbol",
        }),
      ),
      stringSchema,
    ),
    multicallParsed(
      client,
      uniqueTokens.map(
        (address): ContractFunctionParameters => ({
          address,
          abi: ERC20_ABI,
          functionName: "decimals",
        }),
      ),
      numberSchema,
    ),
    multicallParsed(
      client,
      pairs.map(
        (pair): ContractFunctionParameters => ({
          address: pair.contract,
          abi: REWARD_ABI,
          functionName: "tokenRewardsPerEpoch",
          args: [pair.token, epochStart],
        }),
      ),
      bigintSchema,
    ),
  ])
  const meta = new Map(
    uniqueTokens.map((token, index) => [
      token,
      { symbol: symbols[index] ?? "???", decimals: decimals[index] ?? 18 },
    ]),
  )
  const result = new Map<string, IncentiveToken[]>()
  pairs.forEach((pair, index) => {
    const key = pair.contract.toLowerCase()
    const list = result.get(key) ?? []
    const tokenMeta = meta.get(pair.token)
    list.push({
      contract: pair.contract,
      token: pair.token,
      symbol: tokenMeta?.symbol ?? "???",
      decimals: tokenMeta?.decimals ?? 18,
      amount: amounts[index] ?? 0n,
    })
    result.set(key, list)
  })
  return result
}

async function epochBounds(client: MezoClient, nowSeconds: bigint) {
  const epochNext = await client.readContract({
    address: MAINNET.boostVoter,
    abi: VOTER_ABI,
    functionName: "epochNext",
    args: [nowSeconds],
  })
  return { epochStart: epochNext - EPOCH_SECONDS, epochNext }
}

function derivedName(address: Address, tokenId: string | null): string {
  return tokenId ? `veBTC #${tokenId}` : `Gauge ${shortAddress(address)}`
}

async function boostTargets(
  client: MezoClient,
  epochStart: bigint,
  profiles: Map<string, GaugeProfileName>,
): Promise<VoteTarget[]> {
  // Same isolate cache key as GET /api/topology, so the Vote page and Stuart
  // read one snapshot.
  const topology = await cached("topology:31612", 30_000, () =>
    computeGaugeTopology(31_612),
  )
  const gauges = topology.gauges
  const [weights, alive] = await Promise.all([
    multicallParsed(
      client,
      gauges.map(
        (gauge): ContractFunctionParameters => ({
          address: MAINNET.boostVoter,
          abi: VOTER_ABI,
          functionName: "weights",
          args: [gauge.gaugeAddress],
        }),
      ),
      bigintSchema,
    ),
    multicallParsed(
      client,
      gauges.map(
        (gauge): ContractFunctionParameters => ({
          address: MAINNET.boostVoter,
          abi: VOTER_ABI,
          functionName: "isAlive",
          args: [gauge.gaugeAddress],
        }),
      ),
      boolSchema,
    ),
  ])
  const sameEpoch = BigInt(topology.epochStart) === epochStart
  return gauges.map((gauge, index) => {
    const profile = profiles.get(gauge.gaugeAddress.toLowerCase())
    const tokenId = profile?.veBTCTokenId ?? null
    return {
      targetAddress: gauge.gaugeAddress,
      gaugeAddress: gauge.gaugeAddress,
      name: profile?.name ?? derivedName(gauge.gaugeAddress, tokenId),
      nameSource: profile?.name ? "profile" : "derived",
      tokenId,
      isAlive: alive[index] ?? false,
      weight: weights[index] ?? 0n,
      rewardContracts: gauge.bribeAddress ? [gauge.bribeAddress] : [],
      incentives: gauge.bribeAddress
        ? gauge.rewardTokens.map((token) => ({
            contract: gauge.bribeAddress ?? ZERO_ADDRESS,
            token: token.tokenAddress,
            symbol: token.symbol,
            decimals: token.decimals,
            amount: sameEpoch ? BigInt(token.epochAmount) : 0n,
          }))
        : [],
    }
  })
}

async function validatorTargets(
  client: MezoClient,
  epochStart: bigint,
): Promise<VoteTarget[]> {
  const voter = MAINNET.validatorsVoter
  const length = await client.readContract({
    address: voter,
    abi: VOTER_ABI,
    functionName: "length",
  })
  const gauges = live(
    await multicallParsed(
      client,
      Array.from(
        { length: Number(length) },
        (_, index): ContractFunctionParameters => ({
          address: voter,
          abi: VOTER_ABI,
          functionName: "gauges",
          args: [BigInt(index)],
        }),
      ),
      addressSchema,
    ),
  )
  const perGauge = (functionName: "isAlive" | "gaugeToBribe" | "weights") =>
    gauges.map(
      (gauge): ContractFunctionParameters => ({
        address: voter,
        abi: VOTER_ABI,
        functionName,
        args: [gauge],
      }),
    )
  const [alive, bribes, weights, operators] = await Promise.all([
    multicallParsed(client, perGauge("isAlive"), boolSchema),
    multicallParsed(client, perGauge("gaugeToBribe"), addressSchema),
    multicallParsed(client, perGauge("weights"), bigintSchema),
    client
      .readContract({
        address: MAINNET.validatorPool,
        abi: VALIDATOR_POOL_ABI,
        functionName: "validators",
      })
      .catch(() => []),
  ])
  const [operatorGauges, descriptions] = await Promise.all([
    multicallParsed(
      client,
      operators.map(
        (operator): ContractFunctionParameters => ({
          address: voter,
          abi: VALIDATORS_VOTER_EXTRA_ABI,
          functionName: "validatorToGauge",
          args: [operator],
        }),
      ),
      addressSchema,
    ),
    multicallParsed(
      client,
      operators.map(
        (operator): ContractFunctionParameters => ({
          address: MAINNET.validatorPool,
          abi: VALIDATOR_POOL_ABI,
          functionName: "validator",
          args: [operator],
        }),
      ),
      z.tuple([z.string(), z.object({ moniker: z.string() })]),
    ),
  ])
  const monikerByGauge = new Map<string, string>()
  operators.forEach((_, index) => {
    const gauge = operatorGauges[index]
    const moniker = descriptions[index]?.[1].moniker.trim()
    if (gauge && moniker) monikerByGauge.set(gauge.toLowerCase(), moniker)
  })
  const bribeList = live(bribes)
  const incentives = await readRewardIncentives(client, bribeList, epochStart)
  return gauges.map((gauge, index) => {
    const bribe = bribes[index]
    const moniker = monikerByGauge.get(gauge.toLowerCase())
    return {
      targetAddress: gauge,
      gaugeAddress: gauge,
      name: moniker ? moniker.slice(0, 80) : derivedName(gauge, null),
      nameSource: moniker ? "profile" : "derived",
      tokenId: null,
      isAlive: alive[index] ?? false,
      weight: weights[index] ?? 0n,
      rewardContracts: bribe && bribe !== ZERO_ADDRESS ? [bribe] : [],
      incentives:
        bribe && bribe !== ZERO_ADDRESS
          ? (incentives.get(bribe.toLowerCase()) ?? [])
          : [],
    }
  })
}

async function poolTargets(
  client: MezoClient,
  epochStart: bigint,
): Promise<VoteTarget[]> {
  const voter = MAINNET.poolsVoter
  const length = await client.readContract({
    address: voter,
    abi: VOTER_ABI,
    functionName: "length",
  })
  const pools = live(
    await multicallParsed(
      client,
      Array.from(
        { length: Number(length) },
        (_, index): ContractFunctionParameters => ({
          address: voter,
          abi: VOTER_ABI,
          functionName: "pools",
          args: [BigInt(index)],
        }),
      ),
      addressSchema,
    ),
  )
  const [gaugesRaw, weights, symbols] = await Promise.all([
    multicallParsed(
      client,
      pools.map(
        (pool): ContractFunctionParameters => ({
          address: voter,
          abi: POOLS_VOTER_GAUGE_ABI,
          functionName: "gauges",
          args: [pool],
        }),
      ),
      addressSchema,
    ),
    multicallParsed(
      client,
      pools.map(
        (pool): ContractFunctionParameters => ({
          address: voter,
          abi: VOTER_ABI,
          functionName: "weights",
          args: [pool],
        }),
      ),
      bigintSchema,
    ),
    multicallParsed(
      client,
      pools.map(
        (pool): ContractFunctionParameters => ({
          address: pool,
          abi: ERC20_ABI,
          functionName: "symbol",
        }),
      ),
      stringSchema,
    ),
  ])
  const perGauge = (functionName: "isAlive" | "gaugeToBribe" | "gaugeToFees") =>
    gaugesRaw.map(
      (gauge): ContractFunctionParameters => ({
        address: voter,
        abi: VOTER_ABI,
        functionName,
        args: [gauge ?? ZERO_ADDRESS],
      }),
    )
  const [alive, bribes, fees] = await Promise.all([
    multicallParsed(client, perGauge("isAlive"), boolSchema),
    multicallParsed(client, perGauge("gaugeToBribe"), addressSchema),
    multicallParsed(client, perGauge("gaugeToFees"), addressSchema),
  ])
  const rewardContracts = pools.map((_, index) =>
    live([fees[index] ?? null, bribes[index] ?? null]),
  )
  const incentives = await readRewardIncentives(
    client,
    rewardContracts.flat(),
    epochStart,
  )
  return pools.flatMap((pool, index) => {
    const gauge = gaugesRaw[index]
    if (!gauge || gauge === ZERO_ADDRESS) return []
    const symbol = symbols[index]?.trim()
    const contracts = rewardContracts[index] ?? []
    return [
      {
        targetAddress: pool,
        gaugeAddress: gauge,
        name: symbol ? symbol.slice(0, 80) : derivedName(pool, null),
        nameSource: symbol ? "profile" : "derived",
        tokenId: null,
        isAlive: alive[index] ?? false,
        weight: weights[index] ?? 0n,
        rewardContracts: contracts,
        incentives: contracts.flatMap(
          (contract) => incentives.get(contract.toLowerCase()) ?? [],
        ),
      } satisfies VoteTarget,
    ]
  })
}

export async function loadVotingDomain(input: {
  client: MezoClient
  branch: VoteBranch
  nowSeconds: bigint
  profiles: () => Promise<Map<string, GaugeProfileName>>
}): Promise<VotingDomain> {
  const { client, branch } = input
  const voter = voterFor(branch)
  const [{ epochStart, epochNext }, blockNumber, totalWeight] =
    await Promise.all([
      epochBounds(client, input.nowSeconds),
      client.getBlockNumber(),
      client.readContract({
        address: voter,
        abi: VOTER_ABI,
        functionName: "totalWeight",
      }),
    ])
  const targets =
    branch === "boost"
      ? await boostTargets(client, epochStart, await input.profiles())
      : branch === "validators"
        ? await validatorTargets(client, epochStart)
        : await poolTargets(client, epochStart)
  return {
    branch,
    voter,
    governanceAsset: assetFor(branch),
    epochStart,
    epochNext,
    blockNumber,
    fetchedAt: new Date().toISOString(),
    totalWeight,
    maxVotingNum: MAX_VOTING_NUM,
    source:
      branch === "boost"
        ? "BoostVoter"
        : branch === "validators"
          ? "ValidatorsVoter"
          : "PoolsVoter",
    targets,
  }
}

export async function loadWalletLocks(
  client: MezoClient,
  owner: Address,
  asset: "veMEZO" | "veBTC",
): Promise<WalletLock[]> {
  const escrow = escrowFor(asset)
  const balance = await client.readContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "balanceOf",
    args: [owner],
  })
  const count = Number(balance > 256n ? 256n : balance)
  const tokenIds = (
    await multicallParsed(
      client,
      Array.from(
        { length: count },
        (_, index): ContractFunctionParameters => ({
          address: escrow,
          abi: ESCROW_ABI,
          functionName: "ownerToNFTokenIdList",
          args: [owner, BigInt(index)],
        }),
      ),
      bigintSchema,
    )
  ).filter((value): value is bigint => value !== null)
  const [locked, powers] = await Promise.all([
    multicallParsed(
      client,
      tokenIds.map(
        (tokenId): ContractFunctionParameters => ({
          address: escrow,
          abi: ESCROW_ABI,
          functionName: "locked",
          args: [tokenId],
        }),
      ),
      lockedSchema,
    ),
    multicallParsed(
      client,
      tokenIds.map(
        (tokenId): ContractFunctionParameters => ({
          address: escrow,
          abi: ESCROW_ABI,
          functionName: "votingPowerOfNFT",
          args: [tokenId],
        }),
      ),
      bigintSchema,
    ),
  ])
  return tokenIds.map((tokenId, index) => ({
    asset,
    tokenId,
    amount: locked[index]?.amount ?? 0n,
    end: locked[index]?.end ?? 0n,
    isPermanent: locked[index]?.isPermanent ?? false,
    votingPower: powers[index] ?? 0n,
  }))
}

export async function loadLockVoteState(input: {
  client: MezoClient
  branch: VoteBranch
  tokenIds: readonly bigint[]
  targets: readonly Address[]
}): Promise<LockVoteState[]> {
  const voter = voterFor(input.branch)
  const [lastVoted, usedWeights] = await Promise.all([
    multicallParsed(
      input.client,
      input.tokenIds.map(
        (tokenId): ContractFunctionParameters => ({
          address: voter,
          abi: VOTER_ABI,
          functionName: "lastVoted",
          args: [tokenId],
        }),
      ),
      bigintSchema,
    ),
    multicallParsed(
      input.client,
      input.tokenIds.map(
        (tokenId): ContractFunctionParameters => ({
          address: voter,
          abi: VOTER_ABI,
          functionName: "usedWeights",
          args: [tokenId],
        }),
      ),
      bigintSchema,
    ),
  ])
  // Standing votes persist across epochs; only locks with used weight have
  // any to read.
  const voting = input.tokenIds.filter(
    (_, index) => (usedWeights[index] ?? 0n) > 0n,
  )
  const pairs = voting.flatMap((tokenId) =>
    input.targets.map((target) => ({ tokenId, target })),
  )
  const votes = await multicallParsed(
    input.client,
    pairs.map(
      (pair): ContractFunctionParameters => ({
        address: voter,
        abi: VOTER_ABI,
        functionName: "votes",
        args: [pair.tokenId, pair.target],
      }),
    ),
    bigintSchema,
  )
  const byLock = new Map<bigint, Map<string, bigint>>()
  pairs.forEach((pair, index) => {
    const weight = votes[index] ?? 0n
    if (weight <= 0n) return
    const map = byLock.get(pair.tokenId) ?? new Map<string, bigint>()
    map.set(pair.target.toLowerCase(), weight)
    byLock.set(pair.tokenId, map)
  })
  return input.tokenIds.map((tokenId, index) => ({
    tokenId,
    lastVoted: lastVoted[index] ?? 0n,
    usedWeight: usedWeights[index] ?? 0n,
    votes: byLock.get(tokenId) ?? new Map(),
  }))
}

/** Completed epochs (out of `window`) in which each target had incentives. */
export async function loadFundedEpochs(input: {
  client: MezoClient
  domain: VotingDomain
  window: number
}): Promise<Map<string, number>> {
  const queries = input.domain.targets.flatMap((target) =>
    target.incentives.flatMap((incentive) =>
      Array.from({ length: input.window }, (_, back) => ({
        target: target.targetAddress.toLowerCase(),
        incentive,
        epoch: input.domain.epochStart - BigInt(back + 1) * EPOCH_SECONDS,
      })),
    ),
  )
  const amounts = await multicallParsed(
    input.client,
    queries.map(
      (query): ContractFunctionParameters => ({
        address: query.incentive.contract,
        abi: REWARD_ABI,
        functionName: "tokenRewardsPerEpoch",
        args: [query.incentive.token, query.epoch],
      }),
    ),
    bigintSchema,
  )
  const funded = new Map<string, Set<bigint>>()
  queries.forEach((query, index) => {
    if ((amounts[index] ?? 0n) <= 0n) return
    const set = funded.get(query.target) ?? new Set<bigint>()
    set.add(query.epoch)
    funded.set(query.target, set)
  })
  return new Map(
    [...funded.entries()].map(([target, epochs]) => [target, epochs.size]),
  )
}
