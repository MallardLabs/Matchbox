import type { RewardKind, VoterKind } from "@repo/platform-contracts/market"
import {
  type NetworkSlug,
  chainIdForNetwork,
  networkNames,
} from "@repo/platform-contracts/network"
import {
  BOOST_VOTER_ABI,
  BRIBE_ABI,
  CONTRACTS,
  ERC20_ABI,
  NON_STAKING_GAUGE_ABI,
  POOLS_VOTER_ABI,
  VALIDATORS_VOTER_ABI,
  VALIDATOR_POOL_ABI,
  VOTING_ESCROW_ABI,
} from "@repo/shared/contracts"
import {
  http,
  type Abi,
  type Address,
  type ContractFunctionParameters,
  createPublicClient,
  decodeFunctionResult,
  defineChain,
  encodeFunctionData,
  multicall3Abi,
} from "viem"
import { z } from "zod"
import { multicall3Address } from "../reconcile/chain-reader"
import { THIRD_PARTY_VOTER_READ_ABI } from "./abis"

export type ChainReward = {
  kind: RewardKind
  /** Lower-case. */
  contract: string
  /** Lower-case. */
  token: string
  /** tokenRewardsPerEpoch(token, epochStarts[i]); null when that call failed */
  amounts: Array<bigint | null>
}

export type ChainGaugeLink =
  | {
      voter: "boost"
      vebtcTokenId: string | null
      beneficiary: string | null
      /** `BoostVoter.getBoost`, raw: 1e18 = 1x. */
      boost: bigint | null
    }
  | {
      voter: "pools"
      poolAddress: string
      poolSymbol: string | null
      feesContract: string | null
    }
  | {
      voter: "validators"
      operatorAddress: string | null
      moniker: string | null
    }
  | { voter: "third-party" }

export type ChainGauge = {
  /** Lower-case. */
  gaugeAddress: string
  isAlive: boolean | null
  weight: bigint | null
  bribeContract: string | null
  link: ChainGaugeLink
  /** Only reward slots that exist; amounts may be 0n. */
  rewards: ChainReward[]
}

export type TokenMeta = { symbol: string | null; decimals: number | null }

export type MarketRead = {
  network: NetworkSlug
  blockNumber: bigint
  epochStarts: number[]
  totalWeights: Record<VoterKind, bigint | null>
  gauges: ChainGauge[]
  /** Lower-case token address → metadata. */
  tokens: Map<string, TokenMeta>
}

export type MarketReadInput = {
  blockNumber: bigint
  /** Epoch starts (unix seconds) to read reward amounts for, e.g. [current, next]. */
  epochStarts: readonly number[]
  /** Boost gauge (lower-case) → veBTC token id already known (from storage or profiles). */
  knownBoostTokens: ReadonlyMap<string, string>
}

export type MarketReader = {
  blockNumber(): Promise<bigint>
  read(input: MarketReadInput): Promise<MarketRead>
}

export type CallResult =
  | { status: "success"; result: unknown }
  | { status: "failure"; error: unknown }

/** One Multicall3 batch pinned to a block; the seam tests fake. */
export type MarketClient = {
  blockNumber(): Promise<bigint>
  /** A reverted call is a failure result; a transport error rejects. */
  multicall(
    calls: readonly ContractFunctionParameters[],
    blockNumber: bigint,
  ): Promise<CallResult[]>
}

/** Calls per Multicall3 request. */
export const marketChunkSize = 200
/** Multicall3 requests in flight at once, per reader. */
export const marketMaxInFlight = 3
/** Sanity bound on a voter's `length()`; a larger value fails the read. */
const maxTargets = 20_000
/** Reward tokens read per bribe/fees contract (whitelisted tokens only). */
const maxRewardTokens = 32
/** veBTC locks scanned per boost beneficiary when resolving token ids. */
const maxBeneficiaryTokens = 256

const zeroAddress = "0x0000000000000000000000000000000000000000"

type Contracts = (typeof CONTRACTS)["mainnet" | "testnet"]

type Batch = (
  calls: readonly ContractFunctionParameters[],
) => Promise<CallResult[]>

type Limit = <T>(task: () => Promise<T>) => Promise<T>

type RewardSource = { kind: RewardKind; contract: Address }

type RewardLine = { token: Address; amounts: Array<bigint | null> }

type VoterRead = {
  totalWeight: bigint | null
  gauges: ChainGauge[]
  /** Reward tokens seen on this voter's gauges. */
  tokens: Address[]
}

type GaugeState = {
  isAlive: boolean | null
  weight: bigint | null
  bribeContract: Address | null
}

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value): Address => `0x${value.slice(2).toLowerCase()}`)

const operatorListSchema = z.array(addressSchema)

/** `ValidatorPool.validator(operator)` → (consPubKey, description). */
const validatorRecordSchema = z.tuple([
  z.string(),
  z.object({ moniker: z.string() }),
])

/** Lower-case address, including the zero address; null on failure. */
function rawAddressResult(result: CallResult | undefined): Address | null {
  if (result?.status !== "success") return null
  const parsed = addressSchema.safeParse(result.result)
  return parsed.success ? parsed.data : null
}

/** Lower-case address; null on failure or the zero address. */
function addressResult(result: CallResult | undefined): Address | null {
  const address = rawAddressResult(result)
  return address === zeroAddress ? null : address
}

function bigintResult(result: CallResult | undefined): bigint | null {
  if (result?.status !== "success") return null
  return typeof result.result === "bigint" ? result.result : null
}

function booleanResult(result: CallResult | undefined): boolean | null {
  if (result?.status !== "success") return null
  return typeof result.result === "boolean" ? result.result : null
}

function cleanText(value: string, maxLength: number): string | null {
  const text = value.replace(/\p{Cc}/gu, "").trim()
  return text === "" ? null : text.slice(0, maxLength)
}

function textResult(
  result: CallResult | undefined,
  maxLength: number,
): string | null {
  if (result?.status !== "success" || typeof result.result !== "string") {
    return null
  }
  return cleanText(result.result, maxLength)
}

function decimalsResult(result: CallResult | undefined): number | null {
  if (result?.status !== "success") return null
  const value = result.result
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 36
    ? value
    : null
}

function monikerResult(result: CallResult | undefined): string | null {
  if (result?.status !== "success") return null
  const parsed = validatorRecordSchema.safeParse(result.result)
  return parsed.success ? cleanText(parsed.data[1].moniker, 140) : null
}

function indices(count: number): bigint[] {
  return Array.from({ length: count }, (_, index) => BigInt(index))
}

/** `min(value, cap)` as a loop count; null counts as zero. */
function cappedCount(value: bigint | null, cap: number): number {
  if (value === null || value <= 0n) return 0
  return Number(value < BigInt(cap) ? value : BigInt(cap))
}

function targetCount(voter: VoterKind, result: CallResult | undefined): number {
  const length = bigintResult(result)
  if (length === null) throw new Error(`${voter} voter length() failed`)
  if (length > BigInt(maxTargets)) {
    throw new Error(`${voter} voter length() ${length} exceeds ${maxTargets}`)
  }
  return Number(length)
}

/** Every listed address must resolve; a gap would drop a gauge silently. */
function listedAddresses(
  voter: VoterKind,
  functionName: string,
  results: readonly CallResult[],
): Address[] {
  const listed = new Set<Address>()
  results.forEach((result, index) => {
    const address = addressResult(result)
    if (address === null) {
      throw new Error(`${voter} voter ${functionName}(${index}) failed`)
    }
    listed.add(address)
  })
  return [...listed]
}

function createLimit(concurrency: number): Limit {
  let active = 0
  const waiting: Array<() => void> = []
  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active < concurrency) active += 1
    else await new Promise<void>((resolve) => waiting.push(resolve))
    try {
      return await task()
    } finally {
      // Hand the slot straight to the next waiter so no newcomer jumps in.
      const next = waiting.shift()
      if (next) next()
      else active -= 1
    }
  }
}

function createBatch(
  client: MarketClient,
  limit: Limit,
  blockNumber: bigint,
): Batch {
  return async function batch(calls) {
    const chunks: Array<readonly ContractFunctionParameters[]> = []
    for (let start = 0; start < calls.length; start += marketChunkSize) {
      chunks.push(calls.slice(start, start + marketChunkSize))
    }
    const results = await Promise.all(
      chunks.map((chunk) =>
        limit(async () => {
          const chunkResults = await client.multicall(chunk, blockNumber)
          if (chunkResults.length !== chunk.length) {
            throw new Error(
              `Multicall returned ${chunkResults.length} results for ${chunk.length} calls`,
            )
          }
          return chunkResults
        }),
      ),
    )
    return results.flat()
  }
}

function rewardSources(
  bribe: Address | null,
  fees: Address | null,
): RewardSource[] {
  const sources: RewardSource[] = []
  if (bribe !== null) sources.push({ kind: "bribe", contract: bribe })
  if (fees !== null) sources.push({ kind: "fees", contract: fees })
  return sources
}

function rewardsFor(
  sources: readonly RewardSource[],
  lines: ReadonlyMap<Address, RewardLine[]>,
): ChainReward[] {
  return sources.flatMap(({ kind, contract }) =>
    (lines.get(contract) ?? []).map((line) => ({
      kind,
      contract,
      token: line.token,
      amounts: line.amounts,
    })),
  )
}

/**
 * Reward tokens of each bribe/fees contract and their per-epoch amounts.
 * A contract whose `rewardsListLength()` fails contributes no rewards.
 */
async function readRewards(
  batch: Batch,
  sources: readonly RewardSource[],
  epochs: readonly bigint[],
): Promise<Map<Address, RewardLine[]>> {
  const contracts = [...new Set(sources.map((source) => source.contract))]
  const lengths = await batch(
    contracts.map((contract) => ({
      address: contract,
      abi: BRIBE_ABI,
      functionName: "rewardsListLength",
    })),
  )
  const slots = contracts.flatMap((contract, index) =>
    indices(cappedCount(bigintResult(lengths[index]), maxRewardTokens)).map(
      (slot) => ({ contract, slot }),
    ),
  )
  const tokenResults = await batch(
    slots.map(({ contract, slot }) => ({
      address: contract,
      abi: BRIBE_ABI,
      functionName: "rewards",
      args: [slot],
    })),
  )
  const seen = new Set<string>()
  const pairs = slots.flatMap(({ contract }, index) => {
    const token = addressResult(tokenResults[index])
    if (token === null || seen.has(`${contract}:${token}`)) return []
    seen.add(`${contract}:${token}`)
    return [{ contract, token }]
  })
  const amounts = await batch(
    pairs.flatMap(({ contract, token }) =>
      epochs.map((epoch) => ({
        address: contract,
        abi: BRIBE_ABI,
        functionName: "tokenRewardsPerEpoch",
        args: [token, epoch],
      })),
    ),
  )
  const lines = new Map<Address, RewardLine[]>()
  pairs.forEach(({ contract, token }, index) => {
    const line = {
      token,
      amounts: epochs.map((_, epoch) =>
        bigintResult(amounts[index * epochs.length + epoch]),
      ),
    }
    lines.set(contract, [...(lines.get(contract) ?? []), line])
  })
  return lines
}

function rewardTokens(lines: ReadonlyMap<Address, RewardLine[]>): Address[] {
  return [...lines.values()].flatMap((contractLines) =>
    contractLines.map((line) => line.token),
  )
}

async function readTokenMeta(
  batch: Batch,
  tokens: readonly Address[],
): Promise<Map<string, TokenMeta>> {
  const results = await batch(
    tokens.flatMap((token) => [
      { address: token, abi: ERC20_ABI, functionName: "symbol" },
      { address: token, abi: ERC20_ABI, functionName: "decimals" },
    ]),
  )
  return new Map(
    tokens.map((token, index) => [
      token,
      {
        symbol: textResult(results[index * 2], 64),
        decimals: decimalsResult(results[index * 2 + 1]),
      },
    ]),
  )
}

/** `length()` and `totalWeight()`, then `gauges(i)` for every index. */
async function listVoterGauges(
  batch: Batch,
  voter: VoterKind,
  address: Address,
  abi: Abi,
): Promise<{ totalWeight: bigint | null; gauges: Address[] }> {
  const [length, totalWeight] = await batch([
    { address, abi, functionName: "length" },
    { address, abi, functionName: "totalWeight" },
  ])
  const listed = await batch(
    indices(targetCount(voter, length)).map((index) => ({
      address,
      abi,
      functionName: "gauges",
      args: [index],
    })),
  )
  return {
    totalWeight: bigintResult(totalWeight),
    gauges: listedAddresses(voter, "gauges", listed),
  }
}

/** `isAlive`, `weights` and `gaugeToBribe` for gauge-keyed voters. */
async function readGaugeStates(
  batch: Batch,
  address: Address,
  abi: Abi,
  gauges: readonly Address[],
): Promise<GaugeState[]> {
  const results = await batch(
    gauges.flatMap((gauge) => [
      { address, abi, functionName: "isAlive", args: [gauge] },
      { address, abi, functionName: "weights", args: [gauge] },
      { address, abi, functionName: "gaugeToBribe", args: [gauge] },
    ]),
  )
  return gauges.map((_, index) => ({
    isAlive: booleanResult(results[index * 3]),
    weight: bigintResult(results[index * 3 + 1]),
    bribeContract: addressResult(results[index * 3 + 2]),
  }))
}

function knownTokenId(value: string | undefined): bigint | null {
  return value !== undefined && /^[1-9][0-9]{0,77}$/.test(value)
    ? BigInt(value)
    : null
}

type BoostTarget = {
  gauge: Address
  beneficiary: Address | null
  isAlive: boolean | null
}

function tokenGaugeCall(
  contracts: Contracts,
  tokenId: bigint,
): ContractFunctionParameters {
  return {
    address: contracts.boostVoter,
    abi: BOOST_VOTER_ABI,
    functionName: "boostableTokenIdToGauge",
    args: [tokenId],
  }
}

/**
 * The veBTC lock behind each boost gauge: the lock `boostableTokenIdToGauge`
 * maps back to the gauge, taken from the known ids (confirmed, since some are
 * hand-curated) or else from the beneficiary's locks. Killing a gauge clears
 * that mapping, so a killed gauge keeps its known id unconfirmed and is never
 * looked up.
 */
async function resolveBoostTokenIds(
  batch: Batch,
  contracts: Contracts,
  targets: readonly BoostTarget[],
  known: ReadonlyMap<string, string>,
): Promise<Array<bigint | null>> {
  const tokenIds = targets.map(({ gauge, isAlive }) =>
    isAlive === false ? knownTokenId(known.get(gauge)) : null,
  )
  const claims = targets.flatMap(({ gauge, isAlive }, index) => {
    const tokenId = isAlive === false ? null : knownTokenId(known.get(gauge))
    return tokenId === null ? [] : [{ gauge, index, tokenId }]
  })
  const confirmations = await batch(
    claims.map(({ tokenId }) => tokenGaugeCall(contracts, tokenId)),
  )
  claims.forEach(({ gauge, index, tokenId }, position) => {
    if (addressResult(confirmations[position]) === gauge) {
      tokenIds[index] = tokenId
    }
  })
  const owners = [
    ...new Set(
      targets.flatMap(({ beneficiary, isAlive }, index) =>
        tokenIds[index] === null && beneficiary !== null && isAlive !== false
          ? [beneficiary]
          : [],
      ),
    ),
  ]
  if (owners.length === 0) return tokenIds
  const balances = await batch(
    owners.map((owner) => ({
      address: contracts.veBTC,
      abi: VOTING_ESCROW_ABI,
      functionName: "balanceOf",
      args: [owner],
    })),
  )
  const listed = await batch(
    owners.flatMap((owner, index) =>
      indices(
        cappedCount(bigintResult(balances[index]), maxBeneficiaryTokens),
      ).map((slot) => ({
        address: contracts.veBTC,
        abi: VOTING_ESCROW_ABI,
        functionName: "ownerToNFTokenIdList",
        args: [owner, slot],
      })),
    ),
  )
  const candidates = [
    ...new Set(
      listed.flatMap((result) => {
        const tokenId = bigintResult(result)
        return tokenId !== null && tokenId > 0n ? [tokenId] : []
      }),
    ),
  ]
  const mapped = await batch(
    candidates.map((tokenId) => tokenGaugeCall(contracts, tokenId)),
  )
  const byGauge = new Map<Address, bigint>()
  candidates.forEach((tokenId, index) => {
    const gauge = addressResult(mapped[index])
    if (gauge !== null && !byGauge.has(gauge)) byGauge.set(gauge, tokenId)
  })
  return targets.map(
    ({ gauge }, index) => tokenIds[index] ?? byGauge.get(gauge) ?? null,
  )
}

async function readBoosts(
  batch: Batch,
  contracts: Contracts,
  tokenIds: ReadonlyArray<bigint | null>,
): Promise<Array<bigint | null>> {
  const withToken = tokenIds.flatMap((tokenId, index) =>
    tokenId === null ? [] : [{ tokenId, index }],
  )
  const results = await batch(
    withToken.map(({ tokenId }) => ({
      address: contracts.boostVoter,
      abi: BOOST_VOTER_ABI,
      functionName: "getBoost",
      args: [tokenId],
    })),
  )
  const boosts: Array<bigint | null> = tokenIds.map(() => null)
  withToken.forEach(({ index }, position) => {
    boosts[index] = bigintResult(results[position])
  })
  return boosts
}

async function readBoostVoter(
  batch: Batch,
  contracts: Contracts,
  epochs: readonly bigint[],
  known: ReadonlyMap<string, string>,
): Promise<VoterRead> {
  const { totalWeight, gauges } = await listVoterGauges(
    batch,
    "boost",
    contracts.boostVoter,
    BOOST_VOTER_ABI,
  )
  const [states, beneficiaryResults] = await Promise.all([
    readGaugeStates(batch, contracts.boostVoter, BOOST_VOTER_ABI, gauges),
    batch(
      gauges.map((gauge) => ({
        address: gauge,
        abi: NON_STAKING_GAUGE_ABI,
        functionName: "rewardsBeneficiary",
      })),
    ),
  ])
  const targets = gauges.map((gauge, index) => ({
    gauge,
    beneficiary: addressResult(beneficiaryResults[index]),
    isAlive: states[index]?.isAlive ?? null,
  }))
  const sources = states.map((state) =>
    rewardSources(state.bribeContract, null),
  )
  const [tokenIds, lines] = await Promise.all([
    resolveBoostTokenIds(batch, contracts, targets, known),
    readRewards(batch, sources.flat(), epochs),
  ])
  const boosts = await readBoosts(batch, contracts, tokenIds)
  return {
    totalWeight,
    gauges: gauges.map((gaugeAddress, index) => ({
      gaugeAddress,
      isAlive: states[index]?.isAlive ?? null,
      weight: states[index]?.weight ?? null,
      bribeContract: states[index]?.bribeContract ?? null,
      link: {
        voter: "boost",
        vebtcTokenId: tokenIds[index]?.toString() ?? null,
        beneficiary: targets[index]?.beneficiary ?? null,
        boost: boosts[index] ?? null,
      },
      rewards: rewardsFor(sources[index] ?? [], lines),
    })),
    tokens: rewardTokens(lines),
  }
}

/** PoolsVoter votes on pools; `weights` is keyed by pool, the rest by gauge. */
async function readPoolsVoter(
  batch: Batch,
  contracts: Contracts,
  epochs: readonly bigint[],
): Promise<VoterRead> {
  const voter = contracts.poolsVoter
  const [length, totalWeight] = await batch([
    { address: voter, abi: POOLS_VOTER_ABI, functionName: "length" },
    { address: voter, abi: POOLS_VOTER_ABI, functionName: "totalWeight" },
  ])
  const pools = listedAddresses(
    "pools",
    "pools",
    await batch(
      indices(targetCount("pools", length)).map((index) => ({
        address: voter,
        abi: POOLS_VOTER_ABI,
        functionName: "pools",
        args: [index],
      })),
    ),
  )
  const poolResults = await batch(
    pools.flatMap((pool) => [
      {
        address: voter,
        abi: POOLS_VOTER_ABI,
        functionName: "gauges",
        args: [pool],
      },
      {
        address: voter,
        abi: POOLS_VOTER_ABI,
        functionName: "weights",
        args: [pool],
      },
      { address: pool, abi: ERC20_ABI, functionName: "symbol" },
    ]),
  )
  const gauged = pools.flatMap((pool, index) => {
    const gauge = rawAddressResult(poolResults[index * 3])
    if (gauge === null) throw new Error(`pools voter gauges(${pool}) failed`)
    if (gauge === zeroAddress) return []
    return [
      {
        pool,
        gauge,
        weight: bigintResult(poolResults[index * 3 + 1]),
        symbol: textResult(poolResults[index * 3 + 2], 64),
      },
    ]
  })
  const states = await batch(
    gauged.flatMap(({ gauge }) => [
      {
        address: voter,
        abi: POOLS_VOTER_ABI,
        functionName: "isAlive",
        args: [gauge],
      },
      {
        address: voter,
        abi: POOLS_VOTER_ABI,
        functionName: "gaugeToBribe",
        args: [gauge],
      },
      {
        address: voter,
        abi: POOLS_VOTER_ABI,
        functionName: "gaugeToFees",
        args: [gauge],
      },
    ]),
  )
  const rows = gauged.map((row, index) => {
    const bribe = addressResult(states[index * 3 + 1])
    const fees = addressResult(states[index * 3 + 2])
    return {
      ...row,
      isAlive: booleanResult(states[index * 3]),
      bribe,
      fees,
      sources: rewardSources(bribe, fees),
    }
  })
  const lines = await readRewards(
    batch,
    rows.flatMap((row) => row.sources),
    epochs,
  )
  return {
    totalWeight: bigintResult(totalWeight),
    gauges: rows.map((row) => ({
      gaugeAddress: row.gauge,
      isAlive: row.isAlive,
      weight: row.weight,
      bribeContract: row.bribe,
      link: {
        voter: "pools",
        poolAddress: row.pool,
        poolSymbol: row.symbol,
        feesContract: row.fees,
      },
      rewards: rewardsFor(row.sources, lines),
    })),
    tokens: rewardTokens(lines),
  }
}

/**
 * ValidatorsVoter gauges, named from the ValidatorPool registry. Gauges whose
 * operator left the PoA set keep a null operator.
 */
async function readValidatorsVoter(
  batch: Batch,
  contracts: Contracts,
  epochs: readonly bigint[],
): Promise<VoterRead> {
  const voter = contracts.validatorsVoter
  const [length, totalWeight, operatorList] = await batch([
    { address: voter, abi: VALIDATORS_VOTER_ABI, functionName: "length" },
    { address: voter, abi: VALIDATORS_VOTER_ABI, functionName: "totalWeight" },
    {
      address: contracts.validatorPool,
      abi: VALIDATOR_POOL_ABI,
      functionName: "validators",
    },
  ])
  const count = targetCount("validators", length)
  const operators = operatorListSchema.safeParse(
    operatorList?.status === "success" ? operatorList.result : null,
  )
  if (!operators.success) throw new Error("validator pool validators() failed")
  const [listed, registry] = await Promise.all([
    batch(
      indices(count).map((index) => ({
        address: voter,
        abi: VALIDATORS_VOTER_ABI,
        functionName: "gauges",
        args: [index],
      })),
    ),
    batch(
      operators.data.flatMap((operator) => [
        {
          address: voter,
          abi: VALIDATORS_VOTER_ABI,
          functionName: "validatorToGauge",
          args: [operator],
        },
        {
          address: contracts.validatorPool,
          abi: VALIDATOR_POOL_ABI,
          functionName: "validator",
          args: [operator],
        },
      ]),
    ),
  ])
  const gauges = listedAddresses("validators", "gauges", listed)
  const operatorByGauge = new Map<
    Address,
    { operator: Address; moniker: string | null }
  >()
  operators.data.forEach((operator, index) => {
    const gauge = addressResult(registry[index * 2])
    if (gauge === null || operatorByGauge.has(gauge)) return
    operatorByGauge.set(gauge, {
      operator,
      moniker: monikerResult(registry[index * 2 + 1]),
    })
  })
  const states = await readGaugeStates(
    batch,
    voter,
    VALIDATORS_VOTER_ABI,
    gauges,
  )
  const sources = states.map((state) =>
    rewardSources(state.bribeContract, null),
  )
  const lines = await readRewards(batch, sources.flat(), epochs)
  return {
    totalWeight: bigintResult(totalWeight),
    gauges: gauges.map((gaugeAddress, index) => ({
      gaugeAddress,
      isAlive: states[index]?.isAlive ?? null,
      weight: states[index]?.weight ?? null,
      bribeContract: states[index]?.bribeContract ?? null,
      link: {
        voter: "validators",
        operatorAddress: operatorByGauge.get(gaugeAddress)?.operator ?? null,
        moniker: operatorByGauge.get(gaugeAddress)?.moniker ?? null,
      },
      rewards: rewardsFor(sources[index] ?? [], lines),
    })),
    tokens: rewardTokens(lines),
  }
}

async function readThirdPartyVoter(
  batch: Batch,
  contracts: Contracts,
  epochs: readonly bigint[],
): Promise<VoterRead> {
  const voter = contracts.thirdPartyVoter
  const { totalWeight, gauges } = await listVoterGauges(
    batch,
    "third-party",
    voter,
    THIRD_PARTY_VOTER_READ_ABI,
  )
  const states = await readGaugeStates(
    batch,
    voter,
    THIRD_PARTY_VOTER_READ_ABI,
    gauges,
  )
  const sources = states.map((state) =>
    rewardSources(state.bribeContract, null),
  )
  const lines = await readRewards(batch, sources.flat(), epochs)
  return {
    totalWeight,
    gauges: gauges.map((gaugeAddress, index) => ({
      gaugeAddress,
      isAlive: states[index]?.isAlive ?? null,
      weight: states[index]?.weight ?? null,
      bribeContract: states[index]?.bribeContract ?? null,
      link: { voter: "third-party" },
      rewards: rewardsFor(sources[index] ?? [], lines),
    })),
    tokens: rewardTokens(lines),
  }
}

function epochArgument(epochStart: number): bigint {
  if (!Number.isSafeInteger(epochStart) || epochStart < 0) {
    throw new Error(`Invalid epoch start ${epochStart}`)
  }
  return BigInt(epochStart)
}

/**
 * Reads every gauge of the four Mezo Earn voters with its incentives, all
 * pinned to one block. Throws when a voter's gauge list can't be read in
 * full; individual per-gauge or per-token failures become null.
 */
export function createMarketReader(
  network: NetworkSlug,
  client: MarketClient,
): MarketReader {
  const contracts = network === "mezo" ? CONTRACTS.mainnet : CONTRACTS.testnet
  const limit = createLimit(marketMaxInFlight)
  return {
    blockNumber() {
      return client.blockNumber()
    },
    async read(input) {
      const epochs = input.epochStarts.map(epochArgument)
      const batch = createBatch(client, limit, input.blockNumber)
      const [boost, pools, validators, thirdParty] = await Promise.all([
        readBoostVoter(batch, contracts, epochs, input.knownBoostTokens),
        readPoolsVoter(batch, contracts, epochs),
        readValidatorsVoter(batch, contracts, epochs),
        readThirdPartyVoter(batch, contracts, epochs),
      ])
      const voters = [boost, pools, validators, thirdParty]
      const tokens = [...new Set(voters.flatMap((voter) => voter.tokens))]
      return {
        network,
        blockNumber: input.blockNumber,
        epochStarts: [...input.epochStarts],
        totalWeights: {
          boost: boost.totalWeight,
          pools: pools.totalWeight,
          validators: validators.totalWeight,
          "third-party": thirdParty.totalWeight,
        },
        gauges: voters.flatMap((voter) => voter.gauges),
        tokens: await readTokenMeta(batch, tokens),
      }
    },
  }
}

function decodeCall(
  call: ContractFunctionParameters | undefined,
  result: { success: boolean; returnData: `0x${string}` },
): CallResult {
  if (call === undefined || !result.success) {
    return { status: "failure", error: new Error("Call reverted") }
  }
  try {
    return {
      status: "success",
      result: decodeFunctionResult({
        abi: call.abi,
        functionName: call.functionName,
        data: result.returnData,
      }),
    }
  } catch (error) {
    return { status: "failure", error }
  }
}

/**
 * Calls Multicall3 `aggregate3` directly (one request per batch) so that an
 * RPC error rejects instead of turning every call in the batch into a failure.
 */
export function createViemMarketClient(
  network: NetworkSlug,
  rpcUrl: string,
): MarketClient {
  const chain = defineChain({
    id: chainIdForNetwork(network),
    name: networkNames[network],
    nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
    rpcUrls: { default: { http: [rpcUrl] } },
    contracts: { multicall3: { address: multicall3Address } },
  })
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }),
  })
  return {
    blockNumber() {
      return client.getBlockNumber({ cacheTime: 0 })
    },
    async multicall(calls, blockNumber) {
      const results = await client.readContract({
        address: multicall3Address,
        abi: multicall3Abi,
        functionName: "aggregate3",
        args: [
          calls.map((call) => ({
            target: call.address,
            allowFailure: true,
            callData: encodeFunctionData({
              abi: call.abi,
              functionName: call.functionName,
              args: call.args ?? [],
            }),
          })),
        ],
        blockNumber,
      })
      return results.map((result, index) => decodeCall(calls[index], result))
    },
  }
}

export function createViemMarketReader(
  network: NetworkSlug,
  rpcUrl: string,
): MarketReader {
  return createMarketReader(network, createViemMarketClient(network, rpcUrl))
}
