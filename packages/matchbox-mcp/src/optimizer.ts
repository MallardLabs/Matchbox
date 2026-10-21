import { CHAIN_ID, CONTRACTS, VOTING_ESCROW_ABI } from "@repo/shared/contracts"
import { type Address, formatUnits, getAddress } from "viem"
import { z } from "zod"
import { optimizeRewardAllocations } from "@repo/shared/rewards"
import {
  type GaugeAdapterOptions,
  type GaugeSnapshot,
  createMezoClient,
} from "./adapters/matchbox-gauges"
import { proportionalUsd, usd, usdDecimal, zeroUsd } from "./money"

const MAX_LOCKS_PER_ASSET = 256n
// Every Mezo voter rejects ballots over maxVotingNum (30) targets.
const MAX_TARGETS_PER_BALLOT = 30

export const REWARD_OPTIMIZER_VERSION = "reward-optimizer-1.0.0"

export const votingPositionSchema = z.object({
  governanceAsset: z.enum(["veMEZO", "veBTC"]),
  tokenId: z.string().regex(/^\d+$/),
  votingPower: z.string().regex(/^\d+$/),
  votingPowerFormatted: z.string(),
})

export const optimizedAllocationSchema = z.object({
  gaugeId: z.string(),
  gaugeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  gaugeName: z.string(),
  gaugeType: z.enum(["boost", "pool", "vault", "validator"]),
  tokenPair: z.array(z.string()),
  pricingStatus: z.enum(["complete", "partial"]),
  // Display only; basisPoints is what the ballot signs.
  percentage: z.number().min(0.01).max(100),
  basisPoints: z.number().int().min(1).max(10_000),
  depositedUsd: z.string(),
  projectedReturnUsd: z.string(),
  consistencyBps: z.number().int().min(0).max(10_000),
})

export const optimizedBallotSchema = z.object({
  votingContract: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  votingBucket: z.string(),
  governanceAsset: z.enum(["veMEZO", "veBTC"]),
  position: votingPositionSchema,
  allocations: z.array(optimizedAllocationSchema).min(1),
  projectedReturnUsd: z.string(),
})

export const voteOptimizationSchema = z.object({
  objective: z.literal("Best personal return"),
  calculationVersion: z.literal(REWARD_OPTIMIZER_VERSION),
  chainId: z.literal(CHAIN_ID.mainnet),
  snapshotBlock: z.string(),
  generatedAt: z.string(),
  positions: z.array(votingPositionSchema),
  ballots: z.array(optimizedBallotSchema),
  projectedTotalUsd: z.string(),
  notices: z.array(z.string()),
})

export type VotingPosition = z.infer<typeof votingPositionSchema>
export type VoteOptimization = z.infer<typeof voteOptimizationSchema>

export type OptimizeVotesOptions = GaugeAdapterOptions & {
  snapshot: GaugeSnapshot
}

async function readPositionsForAsset(input: {
  address: Address
  governanceAsset: VotingPosition["governanceAsset"]
  options: GaugeAdapterOptions
}): Promise<VotingPosition[]> {
  const client = createMezoClient(input.options)
  const contractAddress =
    input.governanceAsset === "veMEZO"
      ? CONTRACTS.mainnet.veMEZO
      : CONTRACTS.mainnet.veBTC
  const balance = await client.readContract({
    address: contractAddress,
    abi: VOTING_ESCROW_ABI,
    functionName: "balanceOf",
    args: [input.address],
  })
  if (balance === 0n) return []
  if (balance > MAX_LOCKS_PER_ASSET) {
    throw new Error(
      `${input.governanceAsset} position count exceeds the safe read limit`,
    )
  }
  const tokenIdResults = await client.multicall({
    allowFailure: false,
    contracts: Array.from({ length: Number(balance) }, (_, index) => ({
      address: contractAddress,
      abi: VOTING_ESCROW_ABI,
      functionName: "ownerToNFTokenIdList" as const,
      args: [input.address, BigInt(index)],
    })),
  })
  const powerFunction =
    input.governanceAsset === "veBTC"
      ? "unboostedVotingPowerOfNFT"
      : "votingPowerOfNFT"
  const powerResults = await client.multicall({
    allowFailure: false,
    contracts: tokenIdResults.map((tokenId) => ({
      address: contractAddress,
      abi: VOTING_ESCROW_ABI,
      functionName: powerFunction,
      args: [tokenId],
    })),
  })
  return tokenIdResults.flatMap((tokenId, index) => {
    const votingPower = powerResults[index]
    if (votingPower === undefined || votingPower === 0n) return []
    return [
      votingPositionSchema.parse({
        governanceAsset: input.governanceAsset,
        tokenId: tokenId.toString(),
        votingPower: votingPower.toString(),
        votingPowerFormatted: formatUnits(votingPower, 18),
      }),
    ]
  })
}

export async function readBestVotingPositions(
  address: string,
  options: GaugeAdapterOptions = {},
): Promise<VotingPosition[]> {
  const account = getAddress(address)
  const positions = await Promise.all([
    readPositionsForAsset({
      address: account,
      governanceAsset: "veMEZO",
      options,
    }),
    readPositionsForAsset({
      address: account,
      governanceAsset: "veBTC",
      options,
    }),
  ])
  return positions.flat()
}

export function projectedGaugeReturn(input: {
  depositedUsd: string
  currentWeight: bigint
  votingPower: bigint
  allocationBasisPoints: number
}) {
  if (input.allocationBasisPoints === 0) return zeroUsd()
  const allocatedPower =
    (input.votingPower * BigInt(input.allocationBasisPoints)) / 10_000n
  return proportionalUsd(
    usd(input.depositedUsd),
    allocatedPower,
    input.currentWeight + allocatedPower,
  )
}

export function repriceBallots(input: {
  ballots: z.infer<typeof optimizedBallotSchema>[]
  positions: VotingPosition[]
  snapshot: GaugeSnapshot
}): z.infer<typeof optimizedBallotSchema>[] {
  const positions = new Map(
    input.positions.map((position) => [
      `${position.governanceAsset}:${position.tokenId}`,
      position,
    ]),
  )
  return input.ballots.map((ballot) => {
    const position = positions.get(
      `${ballot.governanceAsset}:${ballot.position.tokenId}`,
    )
    if (!position) {
      throw new Error(
        `${ballot.governanceAsset} #${ballot.position.tokenId} is no longer eligible`,
      )
    }
    const allocations = ballot.allocations.map((allocation) => {
      const gauge = input.snapshot.gauges.find(
        (candidate) => candidate.id === allocation.gaugeId,
      )
      if (!gauge) {
        throw new Error(`${allocation.gaugeName} is no longer a live gauge`)
      }
      if (
        gauge.votingContract.toLowerCase() !==
          ballot.votingContract.toLowerCase() ||
        gauge.votingBucket !== ballot.votingBucket
      ) {
        throw new Error(`${allocation.gaugeName} changed voting domains`)
      }
      return optimizedAllocationSchema.parse({
        gaugeId: gauge.id,
        gaugeAddress: gauge.address,
        gaugeName: gauge.name,
        gaugeType: gauge.type,
        tokenPair: gauge.tokenPair,
        pricingStatus: gauge.pricingStatus,
        percentage: allocation.percentage,
        basisPoints: allocation.basisPoints,
        depositedUsd: gauge.depositedUsd,
        projectedReturnUsd: usdDecimal(
          projectedGaugeReturn({
            depositedUsd: gauge.depositedUsd,
            currentWeight: BigInt(gauge.currentWeight),
            votingPower: BigInt(position.votingPower),
            allocationBasisPoints: allocation.basisPoints,
          }),
        ),
        consistencyBps: gauge.consistencyBps,
      })
    })
    const projectedTotal = allocations.reduce(
      (total, allocation) => total.add(usd(allocation.projectedReturnUsd)),
      zeroUsd(),
    )
    return optimizedBallotSchema.parse({
      ...ballot,
      position,
      allocations,
      projectedReturnUsd: usdDecimal(projectedTotal),
    })
  })
}

function usdMicro(decimal: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(decimal.trim())
  if (!match) return 0n
  return (
    BigInt(match[1] ?? "0") * 1_000_000n +
    BigInt((match[2] ?? "").slice(0, 6).padEnd(6, "0"))
  )
}

function usdCents(micro: bigint): string {
  const cents = (micro + 5_000n) / 10_000n
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`
}

/**
 * Adapter over Matchbox Pro's closed-form reward optimizer — the only
 * optimizer. Each voting domain is solved once, jointly across every
 * eligible lock, and each lock gets an independent ballot with the same
 * basis-point vector (non-atomic, one signature per lock).
 */
export function optimizeGaugeSnapshot(input: {
  snapshot: GaugeSnapshot
  positions: VotingPosition[]
}): VoteOptimization {
  const groups = new Map<string, GaugeSnapshot["gauges"]>()
  for (const gauge of input.snapshot.gauges) {
    const key = `${gauge.votingContract.toLowerCase()}:${gauge.votingBucket}`
    const group = groups.get(key) ?? []
    group.push(gauge)
    groups.set(key, group)
  }

  const ballots: z.infer<typeof optimizedBallotSchema>[] = []
  let projectedTotal = 0n
  for (const gauges of groups.values()) {
    const firstGauge = gauges[0]
    if (!firstGauge) continue
    const eligiblePositions = input.positions.filter(
      (position) =>
        position.governanceAsset === firstGauge.governanceAsset &&
        BigInt(position.votingPower) > 0n,
    )
    if (eligiblePositions.length === 0) continue
    const votingPowers = eligiblePositions.map((position) =>
      BigInt(position.votingPower),
    )
    let candidates = gauges.map((gauge) => ({
      id: gauge.id,
      existingWeight: BigInt(gauge.currentWeight),
      incentiveValueMicroUsd: usdMicro(gauge.depositedUsd),
    }))
    let result = optimizeRewardAllocations({ gauges: candidates, votingPowers })
    if (result && result.allocations.length > MAX_TARGETS_PER_BALLOT) {
      const keep = new Set(
        result.allocations
          .slice(0, MAX_TARGETS_PER_BALLOT)
          .map((allocation) => allocation.id),
      )
      candidates = candidates.filter((gauge) => keep.has(gauge.id))
      result = optimizeRewardAllocations({ gauges: candidates, votingPowers })
    }
    if (!result) continue
    const allocations = result.allocations.flatMap((allocation) => {
      const gauge = gauges.find((candidate) => candidate.id === allocation.id)
      return gauge ? [{ allocation, gauge }] : []
    })
    for (const position of eligiblePositions) {
      const power = BigInt(position.votingPower)
      const rows = allocations.map(({ allocation, gauge }) => {
        const lockWeight = (power * allocation.basisPoints) / 10_000n
        const share =
          allocation.voteWeight > 0n
            ? (allocation.projectedRewardMicroUsd * lockWeight) /
              allocation.voteWeight
            : 0n
        return { allocation, gauge, share }
      })
      const ballotProjected = rows.reduce((sum, row) => sum + row.share, 0n)
      projectedTotal += ballotProjected
      ballots.push(
        optimizedBallotSchema.parse({
          votingContract: firstGauge.votingContract,
          votingBucket: firstGauge.votingBucket,
          governanceAsset: firstGauge.governanceAsset,
          position,
          allocations: rows.map(({ allocation, gauge, share }) =>
            optimizedAllocationSchema.parse({
              gaugeId: gauge.id,
              gaugeAddress: gauge.address,
              gaugeName: gauge.name,
              gaugeType: gauge.type,
              tokenPair: gauge.tokenPair,
              pricingStatus: gauge.pricingStatus,
              percentage: Number(allocation.basisPoints) / 100,
              basisPoints: Number(allocation.basisPoints),
              depositedUsd: gauge.depositedUsd,
              projectedReturnUsd: usdCents(share),
              consistencyBps: gauge.consistencyBps,
            }),
          ),
          projectedReturnUsd: usdCents(ballotProjected),
        }),
      )
    }
  }

  const missing = (["veMEZO", "veBTC"] as const).filter(
    (asset) =>
      !input.positions.some((position) => position.governanceAsset === asset),
  )
  return voteOptimizationSchema.parse({
    objective: "Best personal return",
    calculationVersion: REWARD_OPTIMIZER_VERSION,
    chainId: input.snapshot.chainId,
    snapshotBlock: input.snapshot.blockNumber,
    generatedAt: input.snapshot.generatedAt,
    positions: input.positions,
    ballots,
    projectedTotalUsd: usdCents(projectedTotal),
    notices: missing.map(
      (asset) => `No eligible ${asset} lock was found for this wallet.`,
    ),
  })
}

export async function optimizeVotesForWallet(
  address: string,
  options: OptimizeVotesOptions,
): Promise<VoteOptimization> {
  const positions = await readBestVotingPositions(address, options)
  return optimizeGaugeSnapshot({ snapshot: options.snapshot, positions })
}
