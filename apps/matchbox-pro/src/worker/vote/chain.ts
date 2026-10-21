import {
  CHAIN_ID,
  type SupportedChainId,
  VALIDATOR_POOL_ABI,
} from "@repo/shared/contracts"
import { type Address, zeroAddress } from "viem"
import type {
  WirePoolMarket,
  WireValidatorMarket,
} from "../../features/vote/contract"
import {
  REWARD_ABI,
  TOKEN_META_ABI,
  VOTER_ABI,
  validatorPoolAddress,
  voterConfig,
} from "../../features/vote/contracts"
import { chunkArray } from "../../lib/chunk"
import createMezoClient from "../mezoClient"
import { cached } from "../router"
import {
  type CallResult,
  type GaugedPool,
  type RewardPair,
  type TokenMeta,
  groupRewards,
  mapPoolMarket,
  mapValidatorMarket,
  okAddress,
  okBigint,
  okText,
  pairTokenAddresses,
  poolsApiPrices,
  rewardPairs,
  rewardSlots,
  tokenMeta,
  uniqueTokens,
} from "./mappers"

// Two cache layers. Structure (target lists, reward contracts, which tokens
// each pays, names) changes rarely and is kept for minutes; state (weights,
// liveness, this epoch's amounts) is re-read every 30s. A cold state refresh
// is then three RPC rounds instead of seven.
const STRUCTURE_TTL_MS = 120_000
const PRICES_TTL_MS = 60_000
const MULTICALL_CHUNK = 200
const POOLS_API: Record<SupportedChainId, string> = {
  [CHAIN_ID.mainnet]: "https://api.mezo.org",
  [CHAIN_ID.testnet]: "https://api.testnet.mezo.org",
}

type Client = ReturnType<typeof createMezoClient>

const success = (result: unknown): CallResult => ({ status: "success", result })

async function multicall(
  client: Client,
  contracts: readonly unknown[],
): Promise<CallResult[]> {
  if (contracts.length === 0) return []
  const chunks = await Promise.all(
    chunkArray([...contracts], MULTICALL_CHUNK).map(
      (chunk) =>
        client.multicall({
          contracts: chunk as never,
          allowFailure: true,
        }) as Promise<CallResult[]>,
    ),
  )
  return chunks.flat()
}

/**
 * Token prices from the Mezo pools API. Optional: any failure yields an empty
 * map (not memoised) and the client prices what it can by reference.
 */
export async function fetchPoolsApiPrices(
  chainId: SupportedChainId,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string>> {
  try {
    return await cached(`vote:prices:${chainId}`, PRICES_TTL_MS, async () => {
      const response = await fetchImpl(
        `${POOLS_API[chainId]}/pools?filter=none`,
        {
          // The API only answers its own site's origin, like the webapp proxy.
          headers: { origin: "https://mezo.org", accept: "application/json" },
          signal: AbortSignal.timeout(5_000),
        },
      )
      if (!response.ok) throw new Error(`pools API ${response.status}`)
      return poolsApiPrices(await response.json())
    })
  } catch {
    return new Map()
  }
}

/** Which tokens each reward contract pays, and their metadata. */
type RewardStructure = { pairs: RewardPair[]; meta: Map<string, TokenMeta> }

async function readRewardStructure(
  client: Client,
  contracts: readonly Address[],
): Promise<RewardStructure> {
  const lengths = await multicall(
    client,
    contracts.map((address) => ({
      address,
      abi: REWARD_ABI,
      functionName: "rewardsListLength",
    })),
  )
  const slots = rewardSlots(contracts, lengths)
  const pairs = rewardPairs(
    slots,
    await multicall(
      client,
      slots.map((slot) => ({
        address: slot.contract,
        abi: REWARD_ABI,
        functionName: "rewards",
        args: [slot.index],
      })),
    ),
  )
  const tokens = uniqueTokens(pairs)
  const meta = await multicall(
    client,
    tokens.flatMap((address) => [
      { address, abi: TOKEN_META_ABI, functionName: "symbol" },
      { address, abi: TOKEN_META_ABI, functionName: "decimals" },
    ]),
  )
  return { pairs, meta: tokenMeta(tokens, meta) }
}

function readEpochAmounts(
  client: Client,
  pairs: readonly RewardPair[],
  epochStart: bigint,
): Promise<CallResult[]> {
  return multicall(
    client,
    pairs.map((pair) => ({
      address: pair.contract,
      abi: REWARD_ABI,
      functionName: "tokenRewardsPerEpoch",
      args: [pair.token, epochStart],
    })),
  )
}

async function readHead(client: Client, voter: Address) {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const [length, totalWeight, epochStart] = await multicall(client, [
    { address: voter, abi: VOTER_ABI, functionName: "length" },
    { address: voter, abi: VOTER_ABI, functionName: "totalWeight" },
    { address: voter, abi: VOTER_ABI, functionName: "epochStart", args: [now] },
  ])
  const epoch = okBigint(epochStart)
  if (epoch === null) throw new Error("epochStart read failed")
  return {
    length: Number(okBigint(length) ?? 0n),
    totalWeight: okBigint(totalWeight) ?? 0n,
    epochStart: epoch,
  }
}

async function listTargets(
  client: Client,
  voter: Address,
  functionName: "gauges" | "pools",
  length: number,
): Promise<Address[]> {
  const results = await multicall(
    client,
    Array.from({ length }, (_, index) => ({
      address: voter,
      abi: VOTER_ABI,
      functionName,
      args: [BigInt(index)],
    })),
  )
  return results.flatMap((call) => {
    const address = okAddress(call)
    return address ? [address] : []
  })
}

type ValidatorStructure = {
  gauges: Address[]
  bribes: Array<Address | null>
  operators: Address[]
  registry: CallResult[]
  rewards: RewardStructure
}

function validatorStructure(
  chainId: SupportedChainId,
): Promise<ValidatorStructure> {
  return cached(
    `vote:validators:structure:${chainId}`,
    STRUCTURE_TTL_MS,
    async () => {
      const client = createMezoClient(chainId)
      const voter = voterConfig(chainId, "validators").address
      const pool = validatorPoolAddress(chainId)
      const [head, operatorList] = await Promise.all([
        readHead(client, voter),
        client
          .readContract({
            address: pool,
            abi: VALIDATOR_POOL_ABI,
            functionName: "validators",
          })
          .catch((): readonly Address[] => []),
      ])
      const operators = operatorList.flatMap((value) => {
        const operator = okAddress(success(value))
        return operator ? [operator] : []
      })
      const gauges = await listTargets(client, voter, "gauges", head.length)
      const [bribeResults, registry] = await Promise.all([
        multicall(
          client,
          gauges.map((gauge) => ({
            address: voter,
            abi: VOTER_ABI,
            functionName: "gaugeToBribe",
            args: [gauge],
          })),
        ),
        multicall(
          client,
          operators.flatMap((operator) => [
            {
              address: pool,
              abi: VALIDATOR_POOL_ABI,
              functionName: "validator",
              args: [operator],
            },
            {
              address: voter,
              abi: VOTER_ABI,
              functionName: "validatorToGauge",
              args: [operator],
            },
          ]),
        ),
      ])
      const bribes = gauges.map((_, index) => okAddress(bribeResults[index]))
      const rewards = await readRewardStructure(
        client,
        bribes.flatMap((bribe) => (bribe ? [bribe] : [])),
      )
      return { gauges, bribes, operators, registry, rewards }
    },
  )
}

/**
 * Every ValidatorsVoter gauge (including killed ones and validators that left
 * the PoA set), named from the ValidatorPool registry, with this epoch's bribes.
 */
export async function computeValidatorMarket(
  chainId: SupportedChainId,
): Promise<WireValidatorMarket> {
  const client = createMezoClient(chainId)
  const voter = voterConfig(chainId, "validators").address
  const [structure, head, prices] = await Promise.all([
    validatorStructure(chainId),
    readHead(client, voter),
    fetchPoolsApiPrices(chainId),
  ])
  const [live, amounts] = await Promise.all([
    multicall(
      client,
      structure.gauges.flatMap((gauge) => [
        {
          address: voter,
          abi: VOTER_ABI,
          functionName: "weights",
          args: [gauge],
        },
        {
          address: voter,
          abi: VOTER_ABI,
          functionName: "isAlive",
          args: [gauge],
        },
      ]),
    ),
    readEpochAmounts(client, structure.rewards.pairs, head.epochStart),
  ])
  return mapValidatorMarket({
    chainId,
    generatedAt: new Date().toISOString(),
    epochStart: head.epochStart,
    totalWeight: head.totalWeight,
    gauges: structure.gauges,
    states: structure.gauges.flatMap((_, index) => [
      live[index * 2] ?? { status: "failure" },
      live[index * 2 + 1] ?? { status: "failure" },
      success(structure.bribes[index] ?? zeroAddress),
    ]),
    operators: structure.operators,
    registry: structure.registry,
    rewards: groupRewards(
      structure.rewards.pairs,
      amounts,
      structure.rewards.meta,
      prices,
    ),
  })
}

type PoolStructure = {
  /** Gauged targets; `weight` is filled from the state read. */
  rows: Array<Omit<GaugedPool, "weight">>
  rewardContracts: Array<{ bribe: Address | null; fees: Address | null }>
  meta: CallResult[]
  pairSymbols: Map<string, string>
  rewards: RewardStructure
}

function poolStructure(chainId: SupportedChainId): Promise<PoolStructure> {
  return cached(
    `vote:pools:structure:${chainId}`,
    STRUCTURE_TTL_MS,
    async () => {
      const client = createMezoClient(chainId)
      const voter = voterConfig(chainId, "pools").address
      const head = await readHead(client, voter)
      const pools = await listTargets(client, voter, "pools", head.length)
      const gaugeResults = await multicall(
        client,
        pools.map((pool) => ({
          address: voter,
          abi: VOTER_ABI,
          functionName: "gauges",
          args: [pool],
        })),
      )
      const rows = pools.flatMap((pool, index) => {
        const gauge = okAddress(gaugeResults[index])
        return gauge ? [{ pool, gauge }] : []
      })
      const [contracts, meta] = await Promise.all([
        multicall(
          client,
          rows.flatMap(({ gauge }) => [
            {
              address: voter,
              abi: VOTER_ABI,
              functionName: "gaugeToBribe",
              args: [gauge],
            },
            {
              address: voter,
              abi: VOTER_ABI,
              functionName: "gaugeToFees",
              args: [gauge],
            },
          ]),
        ),
        multicall(
          client,
          rows.flatMap(({ pool }) => [
            { address: pool, abi: TOKEN_META_ABI, functionName: "name" },
            { address: pool, abi: TOKEN_META_ABI, functionName: "symbol" },
            { address: pool, abi: TOKEN_META_ABI, functionName: "token0" },
            { address: pool, abi: TOKEN_META_ABI, functionName: "token1" },
          ]),
        ),
      ])
      const rewardContracts = rows.map((_, index) => ({
        bribe: okAddress(contracts[index * 2]),
        fees: okAddress(contracts[index * 2 + 1]),
      }))
      const pairTokens = pairTokenAddresses(
        rows.map((row) => ({ ...row, weight: 0n })),
        meta,
      )
      const [symbols, rewards] = await Promise.all([
        multicall(
          client,
          pairTokens.map((address) => ({
            address,
            abi: TOKEN_META_ABI,
            functionName: "symbol",
          })),
        ),
        readRewardStructure(
          client,
          rewardContracts.flatMap(({ bribe, fees }) =>
            [bribe, fees].flatMap((address) => (address ? [address] : [])),
          ),
        ),
      ])
      const pairSymbols = new Map<string, string>()
      pairTokens.forEach((address, index) => {
        const symbol = okText(symbols[index], 32)
        if (symbol) pairSymbols.set(address.toLowerCase(), symbol)
      })
      return { rows, rewardContracts, meta, pairSymbols, rewards }
    },
  )
}

/**
 * Every PoolsVoter target (pools and vaults; `pools(i)` is the source of
 * truth, the API lists are incomplete), with fee and bribe rewards.
 */
export async function computePoolMarket(
  chainId: SupportedChainId,
): Promise<WirePoolMarket> {
  const client = createMezoClient(chainId)
  const voter = voterConfig(chainId, "pools").address
  const [structure, head, prices] = await Promise.all([
    poolStructure(chainId),
    readHead(client, voter),
    fetchPoolsApiPrices(chainId),
  ])
  const [live, amounts] = await Promise.all([
    multicall(
      client,
      structure.rows.flatMap(({ pool, gauge }) => [
        {
          address: voter,
          abi: VOTER_ABI,
          functionName: "weights",
          args: [pool],
        },
        {
          address: voter,
          abi: VOTER_ABI,
          functionName: "isAlive",
          args: [gauge],
        },
      ]),
    ),
    readEpochAmounts(client, structure.rewards.pairs, head.epochStart),
  ])
  return mapPoolMarket({
    chainId,
    generatedAt: new Date().toISOString(),
    epochStart: head.epochStart,
    totalWeight: head.totalWeight,
    rows: structure.rows.map((row, index) => ({
      ...row,
      weight: okBigint(live[index * 2]) ?? 0n,
    })),
    states: structure.rows.flatMap((_, index) => [
      live[index * 2 + 1] ?? { status: "failure" },
      success(structure.rewardContracts[index]?.bribe ?? zeroAddress),
      success(structure.rewardContracts[index]?.fees ?? zeroAddress),
    ]),
    meta: structure.meta,
    pairSymbols: structure.pairSymbols,
    rewards: groupRewards(
      structure.rewards.pairs,
      amounts,
      structure.rewards.meta,
      prices,
    ),
  })
}
