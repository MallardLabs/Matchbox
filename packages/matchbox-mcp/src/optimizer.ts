import { CHAIN_ID, CONTRACTS, VOTING_ESCROW_ABI } from "@repo/shared/contracts"
import { type Address, formatUnits, getAddress } from "viem"
import { z } from "zod"
import {
  type GaugeAdapterOptions,
  type GaugeSnapshot,
  createMezoClient,
} from "./adapters/matchbox-gauges"
import { proportionalUsd, usd, usdDecimal, zeroUsd } from "./money"

const MAX_LOCKS_PER_ASSET = 256n
const ALLOCATION_POINTS = 100

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
  percentage: z.number().int().min(1).max(100),
  basisPoints: z.number().int().min(100).max(10_000),
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
  calculationVersion: z.literal("optimizer-live-v1"),
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

async function readPositionForAsset(input: {
  address: Address
  governanceAsset: VotingPosition["governanceAsset"]
  options: GaugeAdapterOptions
}): Promise<VotingPosition | null> {
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
  if (balance === 0n) return null
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
  let selectedIndex = 0
  for (let index = 1; index < powerResults.length; index += 1) {
    if ((powerResults[index] ?? 0n) > (powerResults[selectedIndex] ?? 0n)) {
      selectedIndex = index
    }
  }
  const tokenId = tokenIdResults[selectedIndex]
  const votingPower = powerResults[selectedIndex]
  if (
    tokenId === undefined ||
    votingPower === undefined ||
    votingPower === 0n
  ) {
    return null
  }
  return votingPositionSchema.parse({
    governanceAsset: input.governanceAsset,
    tokenId: tokenId.toString(),
    votingPower: votingPower.toString(),
    votingPowerFormatted: formatUnits(votingPower, 18),
  })
}

export async function readBestVotingPositions(
  address: string,
  options: GaugeAdapterOptions = {},
): Promise<VotingPosition[]> {
  const account = getAddress(address)
  const positions = await Promise.all([
    readPositionForAsset({
      address: account,
      governanceAsset: "veMEZO",
      options,
    }),
    readPositionForAsset({
      address: account,
      governanceAsset: "veBTC",
      options,
    }),
  ])
  return positions.filter((position): position is VotingPosition => !!position)
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

export function optimizeGaugeSnapshot(input: {
  snapshot: GaugeSnapshot
  positions: VotingPosition[]
}): VoteOptimization {
  const positions = new Map(
    input.positions.map((position) => [position.governanceAsset, position]),
  )
  const groups = new Map<string, GaugeSnapshot["gauges"]>()
  for (const gauge of input.snapshot.gauges) {
    if (gauge.depositedUsd === "0") continue
    const key = `${gauge.votingContract.toLowerCase()}:${gauge.votingBucket}`
    const group = groups.get(key) ?? []
    group.push(gauge)
    groups.set(key, group)
  }

  const ballots: z.infer<typeof optimizedBallotSchema>[] = []
  for (const gauges of groups.values()) {
    const firstGauge = gauges[0]
    if (!firstGauge) continue
    const position = positions.get(firstGauge.governanceAsset)
    if (!position) continue
    const points = new Map(gauges.map((gauge) => [gauge.id, 0]))
    const votingPower = BigInt(position.votingPower)

    for (let point = 0; point < ALLOCATION_POINTS; point += 1) {
      let selected = gauges[0]
      let selectedMarginal = zeroUsd()
      for (const gauge of gauges) {
        const currentPoints = points.get(gauge.id) ?? 0
        const currentReturn = projectedGaugeReturn({
          depositedUsd: gauge.depositedUsd,
          currentWeight: BigInt(gauge.currentWeight),
          votingPower,
          allocationBasisPoints: currentPoints * 100,
        })
        const nextReturn = projectedGaugeReturn({
          depositedUsd: gauge.depositedUsd,
          currentWeight: BigInt(gauge.currentWeight),
          votingPower,
          allocationBasisPoints: (currentPoints + 1) * 100,
        })
        const marginal = nextReturn.subtract(currentReturn)
        if (!selected || marginal.compare(selectedMarginal) > 0) {
          selected = gauge
          selectedMarginal = marginal
        }
      }
      if (!selected) break
      points.set(selected.id, (points.get(selected.id) ?? 0) + 1)
    }

    const allocations = gauges
      .flatMap((gauge) => {
        const percentage = points.get(gauge.id) ?? 0
        if (percentage === 0) return []
        return [
          optimizedAllocationSchema.parse({
            gaugeId: gauge.id,
            gaugeAddress: gauge.address,
            gaugeName: gauge.name,
            gaugeType: gauge.type,
            tokenPair: gauge.tokenPair,
            pricingStatus: gauge.pricingStatus,
            percentage,
            basisPoints: percentage * 100,
            depositedUsd: gauge.depositedUsd,
            projectedReturnUsd: usdDecimal(
              projectedGaugeReturn({
                depositedUsd: gauge.depositedUsd,
                currentWeight: BigInt(gauge.currentWeight),
                votingPower,
                allocationBasisPoints: percentage * 100,
              }),
            ),
            consistencyBps: gauge.consistencyBps,
          }),
        ]
      })
      .sort(
        (left, right) =>
          right.percentage - left.percentage ||
          left.gaugeName.localeCompare(right.gaugeName),
      )
    if (allocations.length === 0) continue
    const projectedTotal = allocations.reduce(
      (total, allocation) => total.add(usd(allocation.projectedReturnUsd)),
      zeroUsd(),
    )
    ballots.push(
      optimizedBallotSchema.parse({
        votingContract: firstGauge.votingContract,
        votingBucket: firstGauge.votingBucket,
        governanceAsset: firstGauge.governanceAsset,
        position,
        allocations,
        projectedReturnUsd: usdDecimal(projectedTotal),
      }),
    )
  }

  const projectedTotal = ballots.reduce(
    (total, ballot) => total.add(usd(ballot.projectedReturnUsd)),
    zeroUsd(),
  )
  const missing = (["veMEZO", "veBTC"] as const).filter(
    (asset) => !positions.has(asset),
  )
  return voteOptimizationSchema.parse({
    objective: "Best personal return",
    calculationVersion: "optimizer-live-v1",
    chainId: input.snapshot.chainId,
    snapshotBlock: input.snapshot.blockNumber,
    generatedAt: input.snapshot.generatedAt,
    positions: input.positions,
    ballots,
    projectedTotalUsd: usdDecimal(projectedTotal),
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
