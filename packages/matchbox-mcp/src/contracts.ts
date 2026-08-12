import { z } from "zod"
import { preparedEarnDepositSchema } from "./earn"
import { allocationDiffSchema } from "./proposals"
import { preparedVoteSchema } from "./transactions"

export const walletAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Expected an EVM wallet address")

export const walletContextSchema = z.object({
  address: walletAddressSchema,
  label: z.string().min(1).max(80),
  mode: z.enum(["connected", "watching", "inspecting"]),
  network: z.literal("Mezo Mainnet"),
})

export const bridgeRecordSchema = z.object({
  id: z.string(),
  provider: z.enum(["Wormhole", "LayerZero", "Native"]),
  direction: z.enum(["in", "out"]),
  sourceChain: z.string(),
  destinationChain: z.string(),
  sourceAsset: z.string(),
  destinationAsset: z.string(),
  sourceAmount: z.string(),
  destinationAmount: z.string(),
  usdValue: z.string().regex(/^\d+(?:\.\d+)?$/),
  feeUsd: z.string().regex(/^\d+(?:\.\d+)?$/),
  status: z.enum(["completed", "pending", "failed"]),
  happenedAt: z.string(),
  sourceHash: z.string(),
  destinationHash: z.string().nullable(),
})

export const gaugeSchema = z.object({
  id: z.string(),
  address: walletAddressSchema,
  name: z.string(),
  type: z.enum(["pool", "vault", "validator", "boost"]),
  governanceAsset: z.enum(["veMEZO", "veBTC"]),
  votingBucket: z.string(),
  depositedUsd: z.string(),
  projectedReturnUsd: z.string(),
  consistencyBps: z.number().int().min(0).max(10_000),
  allocationPercentage: z.number().int().min(0).max(100),
  tokenPair: z.array(z.string()),
  pricingStatus: z.enum(["complete", "partial"]),
})

const traceItemSchema = z.object({
  label: z.string(),
  detail: z.string(),
})

export const queryBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bridge_records"),
    records: z.array(bridgeRecordSchema),
    providerFilter: z.string().nullable(),
  }),
  z.object({
    type: z.literal("gauge_ranking"),
    gauges: z.array(gaugeSchema),
    objective: z.enum([
      "Best personal return",
      "Most incentives deposited",
      "Most consistently funded",
    ]),
    projectedTotalUsd: z.string().nullable(),
    calculationVersion: z.string(),
  }),
  preparedVoteSchema.extend({ type: z.literal("vote_composer") }),
  preparedEarnDepositSchema.extend({ type: z.literal("zap_route") }),
  allocationDiffSchema.extend({ type: z.literal("allocation_diff") }),
  z.object({
    type: z.literal("clarification_card"),
    prompt: z.string(),
    options: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string(),
        query: z.string(),
        availability: z.enum(["available", "unavailable"]),
      }),
    ),
  }),
  z.object({
    type: z.literal("activity_trace"),
    items: z.array(traceItemSchema),
  }),
])

export const evidenceSchema = z.object({
  source: z.string(),
  url: z.string().url().optional(),
  fetchedAt: z.string(),
  status: z.enum(["live", "fixture", "deterministic"]),
})

export const queryResponseSchema = z.object({
  id: z.string(),
  kind: z.enum(["bridge", "vote", "zap", "support", "clarification"]),
  title: z.string(),
  answer: z.string(),
  generatedAt: z.string(),
  snapshotLabel: z.string(),
  wallet: walletContextSchema,
  blocks: z.array(queryBlockSchema),
  followups: z.array(z.string()),
  evidence: z.array(evidenceSchema).default([]),
  service: z
    .object({
      runtime: z.enum(["groq", "deterministic"]),
      model: z.string().nullable(),
      degraded: z.boolean(),
      notice: z.string().nullable(),
      requestId: z.string(),
    })
    .optional(),
})

export type WalletContext = z.infer<typeof walletContextSchema>
export type QueryBlock = z.infer<typeof queryBlockSchema>
export type QueryResponse = z.infer<typeof queryResponseSchema>
export type BridgeRecord = z.infer<typeof bridgeRecordSchema>
export type Gauge = z.infer<typeof gaugeSchema>
export type Evidence = z.infer<typeof evidenceSchema>
