import { FixedPoint } from "@thesis-co/cent"
import { getAddress } from "viem"
import { z } from "zod"
import {
  type GaugeAdapterOptions,
  fetchGaugeSnapshot,
} from "./adapters/matchbox-gauges"
import { prepareEarnDeposit, preparedEarnDepositSchema } from "./earn"
import { type UsdAmount, usd, usdDecimal, zeroUsd } from "./money"
import {
  type VotingPosition,
  optimizeGaugeSnapshot,
  optimizedBallotSchema,
  readBestVotingPositions,
  repriceBallots,
} from "./optimizer"
import {
  prepareVoteTransactions,
  preparedVoteSchema,
  proposalHashFor,
  type transactionRequestSchema,
} from "./transactions"

const walletModeSchema = z.enum(["connected", "watching", "inspecting"])
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/)

export const allocationDiffSchema = z.object({
  material: z.boolean(),
  allocationChanged: z.boolean(),
  projectedChangeMaterial: z.boolean(),
  callsChanged: z.boolean(),
  beforeProjectedUsd: z.string().nullable(),
  afterProjectedUsd: z.string().nullable(),
  targets: z.array(
    z.object({
      ballotKey: z.string(),
      gaugeId: z.string(),
      gaugeName: z.string(),
      beforeBasisPoints: z.number().int().min(0).max(10_000),
      afterBasisPoints: z.number().int().min(0).max(10_000),
      deltaBasisPoints: z.number().int().min(-10_000).max(10_000),
    }),
  ),
  notice: z.string(),
})

export type AllocationDiff = z.infer<typeof allocationDiffSchema>

export const refreshProposalInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("vote"),
    address: addressSchema,
    walletMode: walletModeSchema,
    proposal: preparedVoteSchema,
    ballots: z.array(optimizedBallotSchema),
    manualOverride: z.boolean().default(false),
    acceptNewOptimum: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("savings"),
    address: addressSchema,
    walletMode: walletModeSchema,
    proposal: preparedEarnDepositSchema,
  }),
])

export const refreshProposalResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("vote"),
    proposal: preparedVoteSchema,
    recommendedBallots: z.array(optimizedBallotSchema),
    preservedManualEdits: z.boolean(),
    diff: allocationDiffSchema,
  }),
  z.object({
    kind: z.literal("savings"),
    proposal: preparedEarnDepositSchema,
    diff: allocationDiffSchema,
  }),
])

export type RefreshProposalInput = z.infer<typeof refreshProposalInputSchema>
export type RefreshProposalResult = z.infer<typeof refreshProposalResultSchema>

function assertProposalBinding(input: {
  address: string
  chainId: number
  from: string
}): void {
  if (input.chainId !== 31_612) {
    throw new Error("Proposal refresh is limited to Mezo Mainnet")
  }
  if (input.address.toLowerCase() !== input.from.toLowerCase()) {
    throw new Error("Proposal refresh wallet does not match its bound address")
  }
}

function assertProposalHash(input: RefreshProposalInput): void {
  const content =
    input.kind === "vote"
      ? {
          ballots: input.proposal.ballots,
          transactionRequests: input.proposal.transactionRequests,
        }
      : {
          amount: input.proposal.amount,
          fundingAsset: input.proposal.fundingAsset,
          vault: input.proposal.vault,
          transactionRequests: input.proposal.transactionRequests,
        }
  const expected = proposalHashFor({
    kind: input.kind,
    from: getAddress(input.proposal.from),
    snapshotBlock: input.proposal.snapshotBlock,
    content,
  })
  if (
    expected.toLowerCase() !== input.proposal.proposalHash.toLowerCase() ||
    `${input.kind}_${expected.slice(2, 10)}` !== input.proposal.proposalId
  ) {
    throw new Error("Proposal content hash does not match its payload")
  }
}

function ballotKey(ballot: z.infer<typeof optimizedBallotSchema>): string {
  return [
    ballot.votingContract.toLowerCase(),
    ballot.votingBucket,
    ballot.governanceAsset,
    ballot.position.tokenId,
  ].join(":")
}

function projectedTotal(
  ballots: z.infer<typeof optimizedBallotSchema>[],
): UsdAmount {
  return ballots.reduce(
    (total, ballot) => total.add(usd(ballot.projectedReturnUsd)),
    zeroUsd(),
  )
}

function projectedChangeIsMaterial(
  before: UsdAmount,
  after: UsdAmount,
): boolean {
  const difference =
    after.compare(before) >= 0 ? after.subtract(before) : before.subtract(after)
  if (before.compare(zeroUsd()) === 0) {
    return difference.compare(zeroUsd()) > 0
  }
  return difference.compare(before.multiply(FixedPoint("0.01"))) >= 0
}

export function createVoteAllocationDiff(input: {
  before: z.infer<typeof optimizedBallotSchema>[]
  after: z.infer<typeof optimizedBallotSchema>[]
  callsChanged: boolean
}): AllocationDiff {
  type AllocationEntry = {
    ballotKey: string
    gaugeId: string
    gaugeName: string
    basisPoints: number
  }
  function allocations(
    ballots: z.infer<typeof optimizedBallotSchema>[],
  ): Map<string, AllocationEntry> {
    const entries = ballots.flatMap((ballot) =>
      ballot.allocations.map((allocation) => {
        const key = ballotKey(ballot)
        return [
          `${key}:${allocation.gaugeId}`,
          {
            ballotKey: key,
            gaugeId: allocation.gaugeId,
            gaugeName: allocation.gaugeName,
            basisPoints: allocation.basisPoints,
          },
        ] as const
      }),
    )
    return new Map(entries)
  }
  const beforeAllocations = allocations(input.before)
  const afterAllocations = allocations(input.after)
  const keys = new Set([
    ...beforeAllocations.keys(),
    ...afterAllocations.keys(),
  ])
  const targets = [...keys]
    .map((key) => {
      const before = beforeAllocations.get(key)
      const after = afterAllocations.get(key)
      const beforeBasisPoints = before?.basisPoints ?? 0
      const afterBasisPoints = after?.basisPoints ?? 0
      return {
        ballotKey: before?.ballotKey ?? after?.ballotKey ?? "unknown",
        gaugeId: before?.gaugeId ?? after?.gaugeId ?? key,
        gaugeName: before?.gaugeName ?? after?.gaugeName ?? "Unknown gauge",
        beforeBasisPoints,
        afterBasisPoints,
        deltaBasisPoints: afterBasisPoints - beforeBasisPoints,
      }
    })
    .filter((target) => target.deltaBasisPoints !== 0)
    .sort(
      (left, right) =>
        left.ballotKey.localeCompare(right.ballotKey) ||
        left.gaugeName.localeCompare(right.gaugeName),
    )
  const allocationChanged = targets.some(
    (target) => Math.abs(target.deltaBasisPoints) >= 100,
  )
  const beforeProjected = projectedTotal(input.before)
  const afterProjected = projectedTotal(input.after)
  const projectedChangeMaterial = projectedChangeIsMaterial(
    beforeProjected,
    afterProjected,
  )
  const material =
    allocationChanged || projectedChangeMaterial || input.callsChanged
  return allocationDiffSchema.parse({
    material,
    allocationChanged,
    projectedChangeMaterial,
    callsChanged: input.callsChanged,
    beforeProjectedUsd: usdDecimal(beforeProjected),
    afterProjectedUsd: usdDecimal(afterProjected),
    targets,
    notice: material
      ? "Live proposal inputs changed materially. Acknowledge this diff before opening the wallet."
      : "The refreshed proposal remains within the material-change thresholds.",
  })
}

function requestsEqual(
  left: z.infer<typeof transactionRequestSchema>[],
  right: z.infer<typeof transactionRequestSchema>[],
): boolean {
  if (left.length !== right.length) return false
  return left.every((request, index) => {
    const other = right[index]
    return (
      !!other &&
      request.chainId === other.chainId &&
      request.from.toLowerCase() === other.from.toLowerCase() &&
      request.to.toLowerCase() === other.to.toLowerCase() &&
      request.data.toLowerCase() === other.data.toLowerCase() &&
      request.value === other.value
    )
  })
}

async function refreshVote(
  input: Extract<RefreshProposalInput, { kind: "vote" }>,
  options: GaugeAdapterOptions,
): Promise<RefreshProposalResult> {
  assertProposalBinding({
    address: input.address,
    chainId: input.proposal.chainId,
    from: input.proposal.from,
  })
  assertProposalHash(input)
  const snapshot = await fetchGaugeSnapshot(options)
  const positions: VotingPosition[] = await readBestVotingPositions(
    input.address,
    options,
  )
  const optimization = optimizeGaugeSnapshot({ snapshot, positions })
  const preserveManualEdits =
    !input.acceptNewOptimum &&
    (input.manualOverride || input.proposal.origin === "manual")
  const refreshedBallots = preserveManualEdits
    ? repriceBallots({ ballots: input.ballots, positions, snapshot })
    : optimization.ballots
  const proposal = await prepareVoteTransactions({
    address: input.address,
    walletMode: input.walletMode,
    snapshot,
    ballots: refreshedBallots,
    origin: preserveManualEdits ? "manual" : "optimizer",
    options,
  })
  const comparisonBallots = preserveManualEdits
    ? optimization.ballots
    : proposal.ballots
  const diff = createVoteAllocationDiff({
    before: input.ballots,
    after: comparisonBallots,
    callsChanged: !requestsEqual(
      input.proposal.transactionRequests,
      proposal.transactionRequests,
    ),
  })
  return refreshProposalResultSchema.parse({
    kind: "vote",
    proposal,
    recommendedBallots: optimization.ballots,
    preservedManualEdits: preserveManualEdits,
    diff,
  })
}

async function refreshSavings(
  input: Extract<RefreshProposalInput, { kind: "savings" }>,
  options: GaugeAdapterOptions,
): Promise<RefreshProposalResult> {
  assertProposalBinding({
    address: input.address,
    chainId: input.proposal.chainId,
    from: input.proposal.from,
  })
  assertProposalHash(input)
  const proposal = await prepareEarnDeposit({
    address: getAddress(input.address),
    walletMode: input.walletMode,
    amount: input.proposal.amount,
    fundingAsset: input.proposal.fundingAsset,
    vault: input.proposal.vault,
    options,
  })
  const callsChanged = !requestsEqual(
    input.proposal.transactionRequests,
    proposal.transactionRequests,
  )
  return refreshProposalResultSchema.parse({
    kind: "savings",
    proposal,
    diff: {
      material: callsChanged,
      allocationChanged: false,
      projectedChangeMaterial: false,
      callsChanged,
      beforeProjectedUsd: null,
      afterProjectedUsd: null,
      targets: [],
      notice: callsChanged
        ? "The live approval or deposit call sequence changed. Acknowledge this diff before opening the wallet."
        : "The refreshed Savings call sequence is unchanged.",
    },
  })
}

export async function refreshProposal(
  rawInput: unknown,
  options: GaugeAdapterOptions = {},
): Promise<RefreshProposalResult> {
  const input = refreshProposalInputSchema.parse(rawInput)
  return input.kind === "vote"
    ? refreshVote(input, options)
    : refreshSavings(input, options)
}
