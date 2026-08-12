import { CHAIN_ID } from "@repo/shared/contracts"
import {
  type Address,
  type Hex,
  encodeFunctionData,
  getAddress,
  keccak256,
  stringToHex,
} from "viem"
import { z } from "zod"
import {
  type GaugeAdapterOptions,
  type GaugeSnapshot,
  createMezoClient,
} from "./adapters/matchbox-gauges"
import {
  type VotingPosition,
  optimizedBallotSchema,
  readBestVotingPositions,
} from "./optimizer"

const voteAbi = [
  {
    inputs: [
      { internalType: "uint256", name: "_tokenId", type: "uint256" },
      { internalType: "address[]", name: "_gaugeVote", type: "address[]" },
      { internalType: "uint256[]", name: "_weights", type: "uint256[]" },
    ],
    name: "vote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const

export const transactionRequestSchema = z.object({
  chainId: z.literal(CHAIN_ID.mainnet),
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  data: z.string().regex(/^0x[a-fA-F0-9]*$/),
  value: z.literal("0x0"),
  label: z.string(),
})

export const proposalMetadataSchema = z.object({
  proposalId: z.string(),
  proposalHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  chainId: z.literal(CHAIN_ID.mainnet),
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  origin: z.enum(["optimizer", "manual", "savings"]),
  expiresAt: z.string(),
  snapshotBlock: z.string(),
})

export const preparedVoteSchema = proposalMetadataSchema.extend({
  origin: z.enum(["optimizer", "manual"]),
  status: z.enum(["unsigned", "blocked", "read-only"]),
  canSign: z.boolean(),
  ballots: z.array(optimizedBallotSchema),
  transactionRequests: z.array(transactionRequestSchema),
  simulation: z.object({
    status: z.enum(["passed", "blocked", "not-run"]),
    calls: z.number().int().nonnegative(),
    gasEstimate: z.string().nullable(),
    reason: z.string().nullable(),
    results: z.array(
      z.object({
        label: z.string(),
        status: z.enum(["passed", "blocked", "not-run"]),
        gasEstimate: z.string().nullable(),
        reason: z.string().nullable(),
      }),
    ),
  }),
})

export type PreparedVote = z.infer<typeof preparedVoteSchema>
export type ProposalMetadata = z.infer<typeof proposalMetadataSchema>

export function createProposalMetadata(input: {
  kind: "vote" | "savings"
  from: Address
  origin: ProposalMetadata["origin"]
  snapshotBlock: string
  content: unknown
  now?: Date
}): ProposalMetadata {
  const proposalHash = keccak256(
    stringToHex(
      JSON.stringify({
        kind: input.kind,
        chainId: CHAIN_ID.mainnet,
        from: input.from.toLowerCase(),
        snapshotBlock: input.snapshotBlock,
        content: input.content,
      }),
    ),
  )
  const now = input.now ?? new Date()
  return proposalMetadataSchema.parse({
    proposalId: `${input.kind}_${proposalHash.slice(2, 10)}`,
    proposalHash,
    chainId: CHAIN_ID.mainnet,
    from: input.from,
    origin: input.origin,
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
    snapshotBlock: input.snapshotBlock,
  })
}

function simulationMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/g, " ").slice(0, 280)
}

function voteTarget(
  gaugeType: GaugeSnapshot["gauges"][number]["type"],
  gaugeAddress: Address,
  targetAddress: Address | null,
): Address {
  if (gaugeType === "pool" || gaugeType === "vault") {
    if (!targetAddress) {
      throw new Error("Pool or vault vote is missing its canonical target")
    }
    return targetAddress
  }
  return gaugeAddress
}

export function buildVoteTransactionRequest(input: {
  account: Address
  ballot: z.infer<typeof optimizedBallotSchema>
  snapshot: GaugeSnapshot
}): z.infer<typeof transactionRequestSchema> {
  const targets = input.ballot.allocations.map((allocation) => {
    const gauge = input.snapshot.gauges.find(
      (candidate) => candidate.id === allocation.gaugeId,
    )
    if (!gauge) throw new Error(`Unknown gauge ${allocation.gaugeName}`)
    if (
      gauge.votingContract.toLowerCase() !==
      input.ballot.votingContract.toLowerCase()
    ) {
      throw new Error(`Gauge ${allocation.gaugeName} belongs to another voter`)
    }
    return voteTarget(gauge.type, gauge.address, gauge.targetAddress)
  })
  const data = encodeFunctionData({
    abi: voteAbi,
    functionName: "vote",
    args: [
      BigInt(input.ballot.position.tokenId),
      targets,
      input.ballot.allocations.map((allocation) =>
        BigInt(allocation.basisPoints),
      ),
    ],
  })
  return transactionRequestSchema.parse({
    chainId: CHAIN_ID.mainnet,
    from: input.account,
    to: input.ballot.votingContract,
    data,
    value: "0x0",
    label: `Vote ${input.ballot.votingBucket} with ${input.ballot.governanceAsset} #${input.ballot.position.tokenId}`,
  })
}

export async function prepareVoteTransactions(input: {
  address: string
  walletMode: "connected" | "watching" | "inspecting"
  snapshot: GaugeSnapshot
  ballots: z.infer<typeof optimizedBallotSchema>[]
  origin?: "optimizer" | "manual"
  options?: GaugeAdapterOptions
}): Promise<PreparedVote> {
  const account = getAddress(input.address)
  const ballots = input.ballots.map((ballot) =>
    optimizedBallotSchema.parse(ballot),
  )
  for (const ballot of ballots) {
    const total = ballot.allocations.reduce(
      (sum, allocation) => sum + allocation.basisPoints,
      0,
    )
    if (total !== 10_000) {
      throw new Error(
        `${ballot.votingBucket} allocations must total 10,000 basis points`,
      )
    }
  }

  const emptyMetadata = createProposalMetadata({
    kind: "vote",
    from: account,
    origin: input.origin ?? "manual",
    snapshotBlock: input.snapshot.blockNumber,
    content: { ballots, transactionRequests: [] },
  })
  if (ballots.length === 0) {
    return preparedVoteSchema.parse({
      ...emptyMetadata,
      status: input.walletMode === "connected" ? "blocked" : "read-only",
      canSign: false,
      ballots: [],
      transactionRequests: [],
      simulation: {
        status: input.walletMode === "connected" ? "blocked" : "not-run",
        calls: 0,
        gasEstimate: null,
        reason: "No eligible voting position and ballot were available.",
        results: [],
      },
    })
  }
  if (input.walletMode !== "connected") {
    return preparedVoteSchema.parse({
      ...emptyMetadata,
      status: "read-only",
      canSign: false,
      ballots,
      transactionRequests: [],
      simulation: {
        status: "not-run",
        calls: 0,
        gasEstimate: null,
        reason: "Watched and inspected wallets are read-only.",
        results: ballots.map((ballot) => ({
          label: `Vote ${ballot.votingBucket} with ${ballot.governanceAsset} #${ballot.position.tokenId}`,
          status: "not-run",
          gasEstimate: null,
          reason: "Connect this wallet to simulate and sign this ballot.",
        })),
      },
    })
  }

  const ownedPositions = await readBestVotingPositions(account, input.options)
  const ownedPositionKeys = new Set(
    ownedPositions.map(
      (position) => `${position.governanceAsset}:${position.tokenId}`,
    ),
  )
  const reconciledBallots = ballots.map((ballot) => {
    if (
      !ownedPositionKeys.has(
        `${ballot.governanceAsset}:${ballot.position.tokenId}`,
      )
    ) {
      throw new Error(
        `Connected wallet does not own the selected ${ballot.governanceAsset} position`,
      )
    }
    return ballot
  })
  const requests = reconciledBallots.map((ballot) =>
    buildVoteTransactionRequest({ account, ballot, snapshot: input.snapshot }),
  )
  const metadata = createProposalMetadata({
    kind: "vote",
    from: account,
    origin: input.origin ?? "manual",
    snapshotBlock: input.snapshot.blockNumber,
    content: { ballots: reconciledBallots, transactionRequests: requests },
  })
  const client = createMezoClient(input.options)
  const simulations = await Promise.all(
    requests.map(async (request) => {
      try {
        const call = {
          account,
          to: getAddress(request.to),
          data: request.data as Hex,
        }
        await client.call(call)
        const gasEstimate = await client.estimateGas(call)
        return {
          label: request.label,
          status: "passed" as const,
          gasEstimate: gasEstimate.toString(),
          reason: null,
        }
      } catch (error) {
        return {
          label: request.label,
          status: "blocked" as const,
          gasEstimate: null,
          reason: simulationMessage(error),
        }
      }
    }),
  )
  const failed = simulations.find(
    (simulation) => simulation.status === "blocked",
  )
  if (!failed) {
    const gasEstimate = simulations.reduce(
      (total, simulation) => total + BigInt(simulation.gasEstimate ?? "0"),
      0n,
    )
    return preparedVoteSchema.parse({
      ...metadata,
      status: "unsigned",
      canSign: true,
      ballots: reconciledBallots,
      transactionRequests: requests,
      simulation: {
        status: "passed",
        calls: requests.length,
        gasEstimate: gasEstimate.toString(),
        reason: null,
        results: simulations,
      },
    })
  }
  return preparedVoteSchema.parse({
    ...metadata,
    status: "blocked",
    canSign: false,
    ballots: reconciledBallots,
    transactionRequests: [],
    simulation: {
      status: "blocked",
      calls: requests.length,
      gasEstimate: null,
      reason: failed.reason,
      results: simulations,
    },
  })
}

export function positionsForBallots(
  positions: VotingPosition[],
): Map<string, VotingPosition> {
  return new Map(
    positions.map((position) => [
      `${position.governanceAsset}:${position.tokenId}`,
      position,
    ]),
  )
}
