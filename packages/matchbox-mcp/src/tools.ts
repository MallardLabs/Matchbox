import { z } from "zod"
import { fetchGaugeSnapshot } from "./adapters/matchbox-gauges"
import { searchWormholeOperations } from "./adapters/wormholescan"
import {
  type BridgeRecord,
  bridgeRecordSchema,
  walletAddressSchema,
  walletContextSchema,
} from "./contracts"
import { prepareEarnDeposit, preparedEarnDepositSchema } from "./earn"
import { demoBridgeRecords } from "./fixtures"
import { usd, usdDecimal, zeroUsd } from "./money"
import {
  optimizeVotesForWallet,
  optimizedAllocationSchema,
  optimizedBallotSchema,
  projectedGaugeReturn,
  readBestVotingPositions,
  voteOptimizationSchema,
} from "./optimizer"
import { prepareVoteTransactions, preparedVoteSchema } from "./transactions"

const walletModeSchema = z.enum(["connected", "watching", "inspecting"])

export const getWalletContextInputSchema = z.object({
  address: walletAddressSchema,
  mode: walletModeSchema.default("connected"),
  label: z.string().min(1).max(80).optional(),
})

export const walletContextResultSchema = z.object({
  wallet: walletContextSchema,
  permissions: z.object({
    canRead: z.literal(true),
    canPrepareTransactions: z.boolean(),
    canSign: z.boolean(),
  }),
})

export const searchTransactionsInputSchema = z.object({
  address: walletAddressSchema,
  category: z.literal("bridge").default("bridge"),
  provider: z.enum(["Wormhole", "all"]).default("all"),
  direction: z.enum(["in", "out"]).optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

export const searchTransactionsResultSchema = z.object({
  records: z.array(bridgeRecordSchema),
  explicitlyLinkedOnly: z.literal(true),
  source: z.object({
    name: z.string(),
    url: z.string().url().optional(),
    fetchedAt: z.string(),
    status: z.enum(["live", "fixture"]),
    notice: z.string().nullable(),
  }),
})

export const optimizeVotesInputSchema = z.object({
  address: walletAddressSchema,
  walletMode: walletModeSchema.default("connected"),
  objective: z.literal("best_personal_return").default("best_personal_return"),
})

export const optimizeVotesResultSchema = voteOptimizationSchema.extend({
  proposal: preparedVoteSchema,
})

export const rankGaugesInputSchema = z.object({
  address: walletAddressSchema,
  objective: z
    .enum(["highest_incentives", "most_consistent"])
    .default("highest_incentives"),
  limit: z.number().int().min(1).max(25).default(10),
})

export const rankGaugesResultSchema = z.object({
  objective: z.enum([
    "Highest incentives deposited",
    "Most consistently funded",
  ]),
  snapshot: z.object({
    chainId: z.number().int(),
    blockNumber: z.string(),
    epochStart: z.string(),
    generatedAt: z.string(),
    source: z.object({
      name: z.string(),
      url: z.string().url(),
      status: z.literal("live"),
    }),
  }),
  gauges: z.array(
    z.object({
      id: z.string(),
      address: walletAddressSchema,
      name: z.string(),
      type: z.enum(["boost", "pool", "vault", "validator"]),
      governanceAsset: z.enum(["veMEZO", "veBTC"]),
      votingBucket: z.string(),
      depositedUsd: z.string(),
      consistencyBps: z.number().int(),
      tokenPair: z.array(z.string()),
      pricingStatus: z.enum(["complete", "partial"]),
    }),
  ),
})

export const prepareVoteInputSchema = z.object({
  address: walletAddressSchema,
  walletMode: walletModeSchema.default("connected"),
  allocations: z
    .array(
      z.object({
        gaugeId: z.string(),
        gaugeName: z.string(),
        percentage: z.number().min(0).max(100),
      }),
    )
    .min(1),
})

export const prepareVoteResultSchema = preparedVoteSchema

export const prepareZapInputSchema = z.object({
  address: walletAddressSchema,
  walletMode: walletModeSchema.default("connected"),
  amount: z
    .union([z.string(), z.number()])
    .transform((value) => String(value))
    .pipe(z.string().regex(/^\d+(?:\.\d+)?$/)),
  fundingAsset: z.string().default("MUSD"),
  vault: z.string().default("MEZO / MUSD Earn Vault"),
})

export const prepareZapResultSchema = preparedEarnDepositSchema

export const toolNames = [
  "get_wallet_context",
  "search_transactions",
  "rank_gauges",
  "optimize_votes",
  "prepare_vote",
  "prepare_zap",
] as const

export type MatchboxToolName = (typeof toolNames)[number]

type ToolContext = {
  fetch?: typeof globalThis.fetch
  allowDemoFallback?: boolean
  dataBaseUrl?: string
  rpcUrls?: string[]
}

export type ToolDefinition = {
  name: MatchboxToolName
  title: string
  description: string
  inputSchema: z.ZodType
  outputSchema: z.ZodType
  annotations: {
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: boolean
  }
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "get_wallet_context",
    title: "Get wallet context",
    description:
      "Resolve whether a Mezo address is connected, watched, or temporarily inspected and return its permissions.",
    inputSchema: getWalletContextInputSchema,
    outputSchema: walletContextResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "search_transactions",
    title: "Search bridge transactions",
    description:
      "Find explicitly linked Wormhole bridge journeys into or out of Mezo for one public wallet. Does not scan matching addresses on unrelated chains.",
    inputSchema: searchTransactionsInputSchema,
    outputSchema: searchTransactionsResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "rank_gauges",
    title: "Rank live gauges",
    description:
      "Rank current Mezo boost, pool, vault, and validator gauges by gross incentives deposited or by consistent funding across recent epochs.",
    inputSchema: rankGaugesInputSchema,
    outputSchema: rankGaugesResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "optimize_votes",
    title: "Optimize gauge votes",
    description:
      "Run the canonical ruthless Matchbox objective: maximize projected personal voting-incentive return in USD.",
    inputSchema: optimizeVotesInputSchema,
    outputSchema: optimizeVotesResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "prepare_vote",
    title: "Prepare an unsigned vote",
    description:
      "Validate allocations totaling 100% and prepare a simulated unsigned gauge-vote proposal. Never signs or submits.",
    inputSchema: prepareVoteInputSchema,
    outputSchema: prepareVoteResultSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "prepare_zap",
    title: "Prepare an unsigned Earn zap",
    description:
      "Prepare an unsigned Earn deposit when an approved contract route exists. Unsupported zaps return unavailable without inventing calls. Never signs or submits.",
    inputSchema: prepareZapInputSchema,
    outputSchema: prepareZapResultSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
]

function stableHandle(prefix: string, value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`
}

function demoRecordsFor(
  provider: "Wormhole" | "all",
  direction: "in" | "out" | undefined,
  limit: number,
): BridgeRecord[] {
  return demoBridgeRecords
    .filter((record) => provider === "all" || record.provider === provider)
    .filter((record) => !direction || record.direction === direction)
    .slice(0, limit)
}

function adapterOptions(context: ToolContext) {
  return {
    ...(context.fetch ? { fetch: context.fetch } : {}),
    ...(context.dataBaseUrl ? { dataBaseUrl: context.dataBaseUrl } : {}),
    ...(context.rpcUrls ? { rpcUrls: context.rpcUrls } : {}),
  }
}

function canonicalGaugeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(the|new|pool|vault|gauge)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
}

async function prepareRequestedVote(
  input: z.infer<typeof prepareVoteInputSchema>,
  context: ToolContext,
) {
  const options = adapterOptions(context)
  const snapshot = await fetchGaugeSnapshot(options)
  const selected = input.allocations.map((allocation) => {
    const canonical = canonicalGaugeName(allocation.gaugeName)
    const candidates = snapshot.gauges.filter(
      (gauge) =>
        gauge.id.toLowerCase() === allocation.gaugeId.toLowerCase() ||
        gauge.address.toLowerCase() === allocation.gaugeId.toLowerCase() ||
        canonicalGaugeName(gauge.name) === canonical,
    )
    if (candidates.length !== 1) {
      throw new Error(
        candidates.length === 0
          ? `I could not resolve “${allocation.gaugeName}” to a live gauge.`
          : `“${allocation.gaugeName}” matches multiple live gauges; use its address.`,
      )
    }
    const gauge = candidates[0]
    if (!gauge) throw new Error("Resolved gauge disappeared")
    return { request: allocation, gauge }
  })
  const votingContracts = new Set(
    selected.map((entry) => entry.gauge.votingContract.toLowerCase()),
  )
  if (votingContracts.size !== 1) {
    throw new Error(
      "A custom ballot must use one voting domain. Stuart can prepare separate veMEZO boost, veBTC pool/vault, and veBTC validator ballots.",
    )
  }
  const firstGauge = selected[0]?.gauge
  if (!firstGauge) throw new Error("No live gauges were selected")
  const positions = await readBestVotingPositions(input.address, options)
  const position = positions.find(
    (candidate) => candidate.governanceAsset === firstGauge.governanceAsset,
  )
  if (!position) {
    const proposalHash = `0x${stableHandle("", input).replace("_", "").padEnd(64, "0")}`
    return prepareVoteResultSchema.parse({
      proposalId: stableHandle("vote", input),
      proposalHash,
      status: input.walletMode === "connected" ? "blocked" : "read-only",
      canSign: false,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      snapshotBlock: snapshot.blockNumber,
      ballots: [],
      transactionRequests: [],
      simulation: {
        status: input.walletMode === "connected" ? "blocked" : "not-run",
        calls: 0,
        gasEstimate: null,
        reason: `No eligible ${firstGauge.governanceAsset} lock was found for this wallet.`,
      },
    })
  }
  const allocations = selected.map(({ request, gauge }) => {
    const basisPoints = Math.round(request.percentage * 100)
    return optimizedAllocationSchema.parse({
      gaugeId: gauge.id,
      gaugeAddress: gauge.address,
      gaugeName: gauge.name,
      gaugeType: gauge.type,
      tokenPair: gauge.tokenPair,
      pricingStatus: gauge.pricingStatus,
      percentage: basisPoints / 100,
      basisPoints,
      depositedUsd: gauge.depositedUsd,
      projectedReturnUsd: usdDecimal(
        projectedGaugeReturn({
          depositedUsd: gauge.depositedUsd,
          currentWeight: BigInt(gauge.currentWeight),
          votingPower: BigInt(position.votingPower),
          allocationBasisPoints: basisPoints,
        }),
      ),
      consistencyBps: gauge.consistencyBps,
    })
  })
  const totalBasisPoints = allocations.reduce(
    (total, allocation) => total + allocation.basisPoints,
    0,
  )
  if (totalBasisPoints !== 10_000) {
    throw new Error(
      `Vote allocations must total 100%; received ${totalBasisPoints / 100}%`,
    )
  }
  const projectedTotal = allocations.reduce(
    (total, allocation) => total.add(usd(allocation.projectedReturnUsd)),
    zeroUsd(),
  )
  const ballot = optimizedBallotSchema.parse({
    votingContract: firstGauge.votingContract,
    votingBucket: firstGauge.votingBucket,
    governanceAsset: firstGauge.governanceAsset,
    position,
    allocations,
    projectedReturnUsd: usdDecimal(projectedTotal),
  })
  return prepareVoteTransactions({
    address: input.address,
    walletMode: input.walletMode,
    snapshot,
    ballots: [ballot],
    options,
  })
}

export async function executeMatchboxTool(
  name: string,
  rawInput: unknown,
  context: ToolContext = {},
): Promise<unknown> {
  switch (name) {
    case "get_wallet_context": {
      const input = getWalletContextInputSchema.parse(rawInput)
      return walletContextResultSchema.parse({
        wallet: {
          address: input.address,
          mode: input.mode,
          label:
            input.label ??
            (input.mode === "connected"
              ? "Connected wallet"
              : input.mode === "watching"
                ? "Watched wallet"
                : "Inspected wallet"),
          network: "Mezo Mainnet",
        },
        permissions: {
          canRead: true,
          canPrepareTransactions: input.mode === "connected",
          canSign: input.mode === "connected",
        },
      })
    }
    case "search_transactions": {
      const input = searchTransactionsInputSchema.parse(rawInput)
      try {
        const result = await searchWormholeOperations({
          address: input.address,
          limit: input.limit,
          ...(input.direction ? { direction: input.direction } : {}),
          ...(context.fetch ? { fetch: context.fetch } : {}),
        })
        if (result.records.length > 0 || !context.allowDemoFallback) {
          return searchTransactionsResultSchema.parse({
            records: result.records,
            explicitlyLinkedOnly: true,
            source: {
              name: "Wormholescan",
              url: result.sourceUrl,
              fetchedAt: result.fetchedAt,
              status: "live",
              notice:
                input.provider === "all"
                  ? "This alpha currently connects Wormholescan. Native and other bridge adapters are not connected yet."
                  : null,
            },
          })
        }
      } catch (error) {
        if (!context.allowDemoFallback) throw error
      }

      return searchTransactionsResultSchema.parse({
        records: demoRecordsFor(input.provider, input.direction, input.limit),
        explicitlyLinkedOnly: true,
        source: {
          name: "Stuart prototype fixtures",
          fetchedAt: new Date().toISOString(),
          status: "fixture",
          notice:
            input.provider === "all"
              ? "No linked Wormholescan journeys were available for the prototype wallet, so labeled demo records are shown. Native and other bridge adapters are not connected yet."
              : "No linked Wormholescan journeys were available for the prototype wallet, so labeled demo records are shown.",
        },
      })
    }
    case "rank_gauges": {
      const input = rankGaugesInputSchema.parse(rawInput)
      const snapshot = await fetchGaugeSnapshot(adapterOptions(context))
      const gauges = [...snapshot.gauges]
        .sort((left, right) =>
          input.objective === "most_consistent"
            ? right.consistencyBps - left.consistencyBps ||
              usd(right.depositedUsd).compare(usd(left.depositedUsd))
            : usd(right.depositedUsd).compare(usd(left.depositedUsd)),
        )
        .slice(0, input.limit)
        .map((gauge) => ({
          id: gauge.id,
          address: gauge.address,
          name: gauge.name,
          type: gauge.type,
          governanceAsset: gauge.governanceAsset,
          votingBucket: gauge.votingBucket,
          depositedUsd: gauge.depositedUsd,
          consistencyBps: gauge.consistencyBps,
          tokenPair: gauge.tokenPair,
          pricingStatus: gauge.pricingStatus,
        }))
      return rankGaugesResultSchema.parse({
        objective:
          input.objective === "most_consistent"
            ? "Most consistently funded"
            : "Highest incentives deposited",
        snapshot: {
          chainId: snapshot.chainId,
          blockNumber: snapshot.blockNumber,
          epochStart: snapshot.epochStart,
          generatedAt: snapshot.generatedAt,
          source: snapshot.source,
        },
        gauges,
      })
    }
    case "optimize_votes": {
      const input = optimizeVotesInputSchema.parse(rawInput)
      const options = adapterOptions(context)
      const snapshot = await fetchGaugeSnapshot(options)
      const optimization = await optimizeVotesForWallet(input.address, {
        ...options,
        snapshot,
      })
      const proposal = await prepareVoteTransactions({
        address: input.address,
        walletMode: input.walletMode,
        snapshot,
        ballots: optimization.ballots,
        options,
      })
      return optimizeVotesResultSchema.parse({ ...optimization, proposal })
    }
    case "prepare_vote": {
      const input = prepareVoteInputSchema.parse(rawInput)
      return prepareVoteResultSchema.parse(
        await prepareRequestedVote(input, context),
      )
    }
    case "prepare_zap": {
      const input = prepareZapInputSchema.parse(rawInput)
      return prepareZapResultSchema.parse(
        await prepareEarnDeposit({
          address: input.address,
          walletMode: input.walletMode,
          amount: input.amount,
          fundingAsset: input.fundingAsset,
          vault: input.vault,
          options: adapterOptions(context),
        }),
      )
    }
    default:
      throw new Error(`Unknown Matchbox tool: ${name}`)
  }
}

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<
    string,
    unknown
  >
}
