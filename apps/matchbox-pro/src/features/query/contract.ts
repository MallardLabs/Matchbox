import { z } from "zod"

// Stuart / Query wire contract, v1. The Worker (`src/worker/query/**`) emits
// these shapes and the Query UI renders them through a trusted block registry.
// Raw values travel over the wire (bigint base units as decimal strings, USD as
// 6-dp strings, ratios as basis points); the client formats them.

export const STUART_CONTRACT_VERSION = 1

// ---------------------------------------------------------------------------
// Primitives

export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/)
export const hexSchema = z.string().regex(/^0x[a-fA-F0-9]*$/)
export const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/)
export const uintStringSchema = z.string().regex(/^\d+$/)
// USD as a fixed 6-dp decimal string (micro-USD bigint rendered with
// `microUsdToDecimalString`). Never a JS number.
export const usd6Schema = z.string().regex(/^-?\d+\.\d{6}$/)
export const tokenAmountSchema = z.object({
  raw: uintStringSchema,
  decimals: z.number().int().min(0).max(36),
  symbol: z.string().min(1).max(16),
})
export const bpsSchema = z.number().int().min(0).max(10_000)
export const signedBpsSchema = z.number().int().min(-1_000_000).max(1_000_000)
// Collateral ratios and similar unbounded ratios (29_477 = 294.77%).
export const ratioBpsSchema = z.number().int().min(0).max(100_000_000)
export const valueStatusSchema = z.enum([
  "exact",
  "estimated",
  "projected",
  "inferred",
  "live",
  "finalized",
  "historical",
  "unpriced",
  "stale",
])
export const MEZO_MAINNET_CHAIN_ID = 31_612
export const MEZO_TESTNET_CHAIN_ID = 31_611
// Requests may carry testnet; Stuart v1 answers `unsupported` there instead of
// failing. Proposals are mainnet only.
export const chainIdSchema = z.union([z.literal(31_612), z.literal(31_611)])
export const proposalChainIdSchema = z.literal(31_612)
export const walletModeSchema = z.enum(["connected", "watching", "inspecting"])
export const governanceAssetSchema = z.enum(["veMEZO", "veBTC"])
// Independent voting contracts: veMEZO → BoostVoter, veBTC → ValidatorsVoter
// and PoolsVoter. Each lock signs one ballot per branch.
export const voteBranchSchema = z.enum(["boost", "validators", "pools"])

export const intentSchema = z.enum([
  "navigate",
  "bridge_search",
  "rank_gauges",
  "optimize_votes",
  "custom_vote",
  "explain_gauge",
  "wallet_earnings",
  "claim_rewards",
  "earn_deposit",
  "zap",
  "loan_position",
  "liquidation_scenario",
  "repay",
  "claim_collateral_surplus",
  "support_report",
  "clarify",
  "unsupported",
])

export const clarificationCardIdSchema = z.enum([
  "gauge-objective",
  "earn-destination",
  "funding-asset",
  "zap-amount",
  "lock-selection",
  "repay-amount",
  "entity-disambiguation",
  "voting-domain",
])

// ---------------------------------------------------------------------------
// Evidence, facts, trace

export const evidenceSchema = z.object({
  id: z.string().max(40),
  kind: z.enum([
    "chain",
    "indexer",
    "price",
    "calculation",
    "provider",
    "docs",
  ]),
  label: z.string().max(60), // chip text, e.g. "Boost gauges · live"
  source: z.string().max(120), // e.g. "BoostVoter 0x2Ba6…13d1"
  url: z.url().optional(),
  blockNumber: uintStringSchema.optional(),
  epoch: z.number().int().optional(),
  fetchedAt: z.iso.datetime(),
  status: z.enum(["live", "finalized", "historical", "deterministic", "stale"]),
  calculationVersion: z.string().max(40).optional(),
})

export const factValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("usd"), usd: usd6Schema }),
  z.object({ kind: z.literal("token"), amount: tokenAmountSchema }),
  z.object({ kind: z.literal("bps"), bps: signedBpsSchema }),
  z.object({ kind: z.literal("count"), count: z.number().int().min(0) }),
  z.object({ kind: z.literal("block"), block: uintStringSchema }),
  z.object({ kind: z.literal("text"), text: z.string().max(80) }),
])

export const factSchema = z.object({
  id: z.string().max(40),
  label: z.string().max(60),
  value: factValueSchema,
  // The exact substring used in answer/why text for this value.
  display: z.string().max(60),
  status: valueStatusSchema,
  evidenceRefs: z.array(z.string()).min(1),
})

export const traceItemSchema = z.object({
  id: z.string().max(40),
  label: z.string().max(120), // "Compared 42 gauges at block 12,482,113"
  detail: z.string().max(160).nullable(),
  tool: z.string().max(40).nullable(),
  durationMs: z.number().int().min(0).nullable(),
  status: z.enum(["ok", "error", "skipped"]),
})

export const answerSchema = z.object({
  kind: z.enum([
    "result",
    "clarification",
    "empty",
    "unavailable",
    "refusal",
    "unsupported",
  ]),
  // "template": rendered from a server template. "model": Claude's sentence,
  // admitted only after every number in it matched that turn's tool results.
  origin: z.enum(["template", "model"]),
  templateId: z.string().max(60),
  text: z.string().max(400),
  factRefs: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
})

export const whySchema = z.object({
  templateId: z.string().max(60),
  items: z
    .array(
      z.object({
        text: z.string().max(240),
        factRefs: z.array(z.string()),
      }),
    )
    .max(6),
})

export const followupSchema = z.object({
  id: z.string().max(40),
  label: z.string().max(80),
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("query"), query: z.string().max(200) }),
    z.object({ kind: z.literal("navigate"), to: z.string().max(120) }),
    z.object({
      kind: z.literal("clarification"),
      cardId: clarificationCardIdSchema,
      optionId: z.string().max(80),
    }),
  ]),
})

// ---------------------------------------------------------------------------
// Proposals (unsigned; the wallet signs, Matchbox never does)

export const transactionRequestSchema = z.object({
  index: z.number().int().min(0),
  chainId: proposalChainIdSchema,
  from: addressSchema,
  to: addressSchema,
  data: hexSchema,
  value: z.literal("0x0"), // v1: no native sends
  kind: z.enum(["approve", "vote", "claim", "deposit", "swap", "repay"]),
  label: z.string().max(120), // "1 · Approve 5,000.00 mUSD"
  dependsOn: z.number().int().min(0).nullable(),
  // Re-quote or re-read before prompting for this call once its dependency is
  // mined (swap → deposit uses the actual amount received).
  refreshAfterDependency: z.boolean(),
})

export const approvalSchema = z.object({
  token: addressSchema,
  spender: addressSchema,
  amount: tokenAmountSchema,
  mode: z.literal("exact"),
})

export const simulationSchema = z.object({
  status: z.enum(["passed", "partial", "blocked", "not_run"]),
  method: z.enum(["eth_call", "eth_simulateV1", "none"]),
  calls: z.array(
    z.object({
      index: z.number().int().min(0),
      status: z.enum(["passed", "reverted", "not_run"]),
      gasEstimate: uintStringSchema.nullable(),
      reason: z.string().max(280).nullable(),
    }),
  ),
})

export const quoteSchema = z.object({
  routerId: z.string().max(60),
  router: addressSchema,
  pool: addressSchema,
  amountIn: tokenAmountSchema,
  amountInUsd: usd6Schema.nullable(),
  quotedOut: tokenAmountSchema,
  minOut: tokenAmountSchema,
  feeBps: bpsSchema,
  priceImpactBps: bpsSchema,
  maxPriceImpactBps: bpsSchema,
  slippageBps: bpsSchema,
  quotedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  deadline: z.number().int().min(0), // unix seconds passed to the router
})

export const ballotAllocationSchema = z.object({
  targetId: z.string().max(80),
  // Gauge address (boost/validators) or pool/vault address (pools).
  targetAddress: addressSchema,
  name: z.string().max(80),
  bps: z.number().int().min(1).max(10_000),
  projectedUsd: usd6Schema.nullable(),
})

export const ballotSchema = z.object({
  ballotKey: z.string().max(80), // `${branch}:${tokenId}`
  branch: voteBranchSchema,
  governanceAsset: governanceAssetSchema,
  votingContract: addressSchema,
  tokenId: uintStringSchema,
  votingPower: uintStringSchema,
  selected: z.boolean(),
  allocations: z.array(ballotAllocationSchema).min(1).max(30),
})

export const claimSourceKindSchema = z.enum([
  "boost_bribes",
  "pool_fees_bribes",
  "validator_bribes",
  "collateral_surplus",
])

export const claimRowSchema = z.object({
  rowKey: z.string().max(80), // `${source}:${tokenId ?? "wallet"}`
  source: claimSourceKindSchema,
  contract: addressSchema,
  tokenId: uintStringSchema.nullable(),
  rewards: z
    .array(
      z.object({
        token: addressSchema,
        amount: tokenAmountSchema,
        usd: usd6Schema.nullable(), // null = unpriced, never $0
      }),
    )
    .max(64),
  usd: usd6Schema.nullable(),
  unpricedCount: z.number().int().min(0),
})

export const proposalContentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("vote"),
    ballots: z.array(ballotSchema).min(1).max(64),
    manualOverride: z.boolean(),
    projectedUsd: usd6Schema.nullable(),
    projectedNative: tokenAmountSchema.nullable(),
  }),
  z.object({
    kind: z.literal("claim"),
    rows: z.array(claimRowSchema).min(1).max(64),
    totalUsd: usd6Schema.nullable(),
    unpricedCount: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("repay"),
    troveOwner: addressSchema,
    amount: tokenAmountSchema,
    mode: z.enum(["partial", "max_partial"]),
    debtBefore: tokenAmountSchema,
    debtAfter: tokenAmountSchema,
    collateralRatioBeforeBps: ratioBpsSchema.nullable(),
    collateralRatioAfterBps: ratioBpsSchema.nullable(),
    liquidationPriceBeforeUsd: usd6Schema.nullable(),
    liquidationPriceAfterUsd: usd6Schema.nullable(),
    interestRepaid: tokenAmountSchema,
    principalRepaid: tokenAmountSchema,
  }),
  z.object({
    kind: z.literal("zap"),
    fundingAsset: z.enum(["MEZO"]),
    destinationId: z.string().max(60),
    depositAmount: tokenAmountSchema,
    expectedShares: tokenAmountSchema,
  }),
  z.object({
    kind: z.literal("earn_deposit"),
    destinationId: z.string().max(60),
    amount: tokenAmountSchema,
  }),
  z.object({
    kind: z.literal("claim_surplus"),
    amount: tokenAmountSchema,
  }),
])

export const proposalSchema = z.object({
  proposalId: z.string().max(40), // `${kind}_${hash.slice(2, 10)}`
  // keccak256 of the canonical JSON of every other field except refreshToken.
  proposalHash: z.string().regex(/^0x[a-f0-9]{64}$/),
  // HMAC-SHA256(server secret, proposalHash|from|chainId|expiresAt) as hex.
  // Present it to /api/proposal/refresh; a client cannot forge origin, calls
  // or expiry without it.
  refreshToken: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum([
    "vote",
    "claim",
    "repay",
    "zap",
    "earn_deposit",
    "claim_surplus",
  ]),
  chainId: proposalChainIdSchema,
  from: addressSchema,
  origin: z.enum(["optimizer", "manual", "user_request"]),
  status: z.enum([
    "unsigned",
    "needs_approval",
    "blocked",
    "read_only",
    "unavailable",
    "expired",
  ]),
  // False unless the wallet is connected AND simulation passed.
  canSign: z.boolean(),
  blockedReason: z
    .enum([
      "connect_this_wallet",
      "insufficient_balance",
      "simulation_reverted",
      "price_impact_too_high",
      "oracle_stale",
      "exceeds_max_repay",
      "trove_not_active",
      "voting_window_closed",
      "already_voted_this_epoch",
      "nothing_to_claim",
    ])
    .nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  snapshotBlock: uintStringSchema,
  calculationVersion: z.string().max(40),
  atomicity: z.enum(["single", "sequential_non_atomic", "batchable"]),
  approvals: z.array(approvalSchema).max(8),
  calls: z.array(transactionRequestSchema).max(64),
  simulation: simulationSchema,
  quote: quoteSchema.nullable(),
  content: proposalContentSchema,
})

// ---------------------------------------------------------------------------
// UI blocks (trusted, versioned registry). Unknown type/version = reject.

const blockBase = {
  version: z.literal(1),
  id: z.string().max(60),
  evidenceRefs: z.array(z.string()),
}

// Frame 32 "Lead result", frame 33 rail, M04/T04.
export const metricSummaryBlockSchema = z.object({
  ...blockBase,
  type: z.literal("metric_summary"),
  label: z.string().max(60), // "Projected this epoch"
  primaryUsd: usd6Schema.nullable(),
  primaryStatus: valueStatusSchema,
  secondary: tokenAmountSchema.nullable(), // native equivalent
  apyBps: z.number().int().nullable(),
  apyStatus: z.literal("extrapolated").nullable(),
  objectiveNote: z.literal("maximize_projected_personal_usd").nullable(),
  snapshotBlock: uintStringSchema.nullable(),
})

// Frame 32 "Recommended allocation" (Gauge / Alloc / Projected / Native / Funded).
export const gaugeRankingBlockSchema = z.object({
  ...blockBase,
  type: z.literal("gauge_ranking"),
  objective: z.enum([
    "best_personal_return",
    "most_incentives_deposited",
    "most_consistently_funded",
    // Incentives per vote (extrapolated APY), the Vote page's "APY ↓" sort.
    "highest_apy",
  ]),
  domain: z.object({
    branch: voteBranchSchema,
    governanceAsset: governanceAssetSchema,
    votingContract: addressSchema,
  }),
  epoch: z.object({
    number: z.number().int().nullable(),
    start: uintStringSchema, // unix seconds
    endsAt: z.iso.datetime(),
  }),
  snapshotBlock: uintStringSchema,
  calculationVersion: z.string().max(40),
  consistencyWindow: z
    .union([z.literal(4), z.literal(8), z.literal(12)])
    .nullable(),
  rows: z
    .array(
      z.object({
        targetId: z.string().max(80),
        targetAddress: addressSchema,
        name: z.string().max(80), // untrusted profile text: render escaped
        nameSource: z.enum(["profile", "derived"]),
        tokenId: uintStringSchema.nullable(), // "#221"
        allocationBps: bpsSchema.nullable(), // null for research rankings
        projectedUsd: usd6Schema.nullable(),
        projectedNative: tokenAmountSchema.nullable(),
        depositedUsd: usd6Schema.nullable(),
        pricingStatus: z.enum(["complete", "partial", "unpriced"]),
        fundedEpochs: z.number().int().min(0).nullable(),
        observedEpochs: z.number().int().min(0).nullable(),
        competingWeight: uintStringSchema,
        // Extrapolated APY at current votes; absent on older payloads.
        apyBps: z.number().int().nullable().optional(),
      }),
    )
    .max(50),
  proposalId: z.string().max(40).nullable(),
  actions: z.array(
    z.enum(["review_vote", "edit_allocation", "open_vote_page"]),
  ),
})

// Frame 32 "Review vote" / "Edit allocation" → CheckoutSheet.
export const voteComposerBlockSchema = z.object({
  ...blockBase,
  type: z.literal("vote_composer"),
  proposalId: z.string().max(40),
  ballots: z.array(ballotSchema).max(64),
  editable: z.boolean(),
  manualOverride: z.boolean(),
  nonAtomicNotice: z.boolean(), // independent ballots, one signature each
})

// Frame 38 "Recommendation changed before sign".
export const allocationDiffBlockSchema = z.object({
  ...blockBase,
  type: z.literal("allocation_diff"),
  proposalId: z.string().max(40),
  refreshedProposalId: z.string().max(40),
  refreshedAtBlock: uintStringSchema,
  material: z.boolean(),
  reasons: z.array(
    z.enum([
      "allocation_pp",
      "projected_pct",
      "target_set",
      "ballot_set",
      "quote",
      "approval",
      "can_sign",
      "position",
    ]),
  ),
  beforeProjectedUsd: usd6Schema.nullable(),
  afterProjectedUsd: usd6Schema.nullable(),
  projectedDeltaBps: signedBpsSchema.nullable(),
  beforeNative: tokenAmountSchema.nullable(),
  afterNative: tokenAmountSchema.nullable(),
  rows: z
    .array(
      z.object({
        ballotKey: z.string().max(80),
        targetId: z.string().max(80),
        name: z.string().max(80),
        beforeBps: bpsSchema,
        afterBps: bpsSchema,
        deltaProjectedUsd: usd6Schema.nullable(), // "−$2.10"
      }),
    )
    .max(100),
  manualEditsPreserved: z.boolean(),
  actions: z.array(z.enum(["acknowledge_new_optimum", "keep_my_allocation"])),
})

// Frame 36 "Zap $50 MEZO into the mUSD vault".
export const zapRouteBlockSchema = z.object({
  ...blockBase,
  type: z.literal("zap_route"),
  proposalId: z.string().max(40).nullable(),
  status: z.enum(["quoted", "unavailable", "expired", "read_only", "blocked"]),
  unavailableReason: z
    .enum([
      "no_approved_router",
      "dual_deposit_unavailable",
      "unsupported_asset",
      "insufficient_balance",
      "quote_failed",
      "price_impact_too_high",
      "network_unsupported",
    ])
    .nullable(),
  destination: z.object({
    vaultId: z.string().max(60),
    name: z.string().max(80),
    address: addressSchema.nullable(),
    kind: z.enum(["single_sided", "dual_deposit_lp"]),
  }),
  steps: z
    .array(
      z.object({
        index: z.number().int().min(1),
        kind: z.enum(["fund", "swap", "quote", "deposit"]),
        label: z.string().max(60),
        amount: tokenAmountSchema.nullable(),
      }),
    )
    .max(8),
  youPay: tokenAmountSchema.nullable(),
  youPayUsd: usd6Schema.nullable(),
  quotedOut: tokenAmountSchema.nullable(),
  minReceived: tokenAmountSchema.nullable(),
  feeBps: bpsSchema.nullable(),
  priceImpactBps: bpsSchema.nullable(),
  priceImpactLevel: z.enum(["ok", "warn", "blocked"]).nullable(),
  slippageBps: bpsSchema.nullable(),
  slippageEditable: z.boolean(),
  approvals: z.array(approvalSchema).max(4),
  // sMUSD mints 1:1 with the deposit, so shares are exact, not expected.
  shares: tokenAmountSchema.nullable(),
  sharesExact: z.boolean(),
  quoteExpiresAt: z.iso.datetime().nullable(),
  callCount: z.number().int().min(0),
  atomicity: z.enum(["single", "sequential_non_atomic", "batchable"]),
})

// Frame 37 "Nothing has been sent. Preview is the report."
export const supportReportItemSchema = z.object({
  itemId: z.string().max(40),
  kind: z.enum([
    "message",
    "simulation_excerpt",
    "wallet",
    "entity",
    "transaction",
    "indexer_status",
    "trace",
  ]),
  label: z.string().max(160),
  value: z.string().max(400),
  removable: z.boolean(),
})

export const supportReportDraftSchema = z.object({
  draftId: z.string().max(40),
  createdAt: z.iso.datetime(),
  chainId: chainIdSchema,
  kind: z.enum(["claim", "vote", "loan", "zap", "bridge", "data", "other"]),
  title: z.string().max(120),
  problemStatement: z.string().max(2_000),
  included: z.array(supportReportItemSchema).max(20),
  // HMAC over the draft so a submit can only carry items the server drafted.
  draftToken: z.string().regex(/^[a-f0-9]{64}$/),
})

export const supportReportPreviewBlockSchema = z.object({
  ...blockBase,
  type: z.literal("support_report_preview"),
  draft: supportReportDraftSchema,
  excludedSummary: z.literal("history_watchlist_rpc"), // fixed copy key
  sent: z.literal(false),
  contactMethods: z.array(z.enum(["thread_only", "email"])),
})

// Frames 40 and 43–45 left column.
export const loanPositionBlockSchema = z.object({
  ...blockBase,
  type: z.literal("loan_position"),
  troveOwner: addressSchema,
  status: z.enum([
    "active",
    "closed_by_owner",
    "closed_by_liquidation",
    "closed_by_redemption",
    "none",
  ]),
  collateral: tokenAmountSchema,
  collateralUsd: usd6Schema.nullable(),
  collateralPriceUsd: usd6Schema.nullable(),
  priceStatus: z.enum(["live", "stale", "unavailable"]),
  principal: tokenAmountSchema,
  interest: tokenAmountSchema,
  debt: tokenAmountSchema, // principal + accrued interest
  interestRateBps: z.number().int().min(0).nullable(), // simple, fixed per trove
  collateralRatioBps: ratioBpsSchema.nullable(), // null when unpriced
  minCollateralRatioBps: ratioBpsSchema, // MCR, 11_000
  criticalCollateralRatioBps: ratioBpsSchema, // CCR, 15_000
  totalCollateralRatioBps: ratioBpsSchema.nullable(),
  recoveryMode: z.boolean().nullable(),
  health: z.enum([
    "healthy",
    "near_liquidation",
    "liquidatable",
    "unpriced",
    "inactive",
  ]),
  liquidationPriceUsd: usd6Schema.nullable(),
  dropToLiquidationBps: bpsSchema.nullable(),
  gasCompensation: tokenAmountSchema,
  maxPartialRepay: tokenAmountSchema.nullable(),
  musdBalance: tokenAmountSchema.nullable(),
  // BTC left in CollSurplusPool after a redemption or liquidation.
  surplusCollateral: tokenAmountSchema.nullable(),
  snapshotBlock: uintStringSchema,
  history: z
    .array(
      z.object({
        at: z.iso.datetime(),
        kind: z.enum([
          "open",
          "repay",
          "borrow",
          "add_collateral",
          "withdraw_collateral",
          "close",
          "redeemed",
          "liquidated",
          "adjust",
        ]),
        amount: tokenAmountSchema.nullable(),
        finality: z.enum(["final", "pending"]),
        txHash: txHashSchema.nullable(),
      }),
    )
    .max(20),
  historyStatus: z.enum(["live", "unavailable"]),
  actions: z.array(
    z.enum(["review_repayment", "run_scenario", "claim_collateral_surplus"]),
  ),
})

// Frame 41 "Deterministic model on the current snapshot. Not a forecast."
export const liquidationScenarioBlockSchema = z.object({
  ...blockBase,
  type: z.literal("liquidation_scenario"),
  asset: z.literal("BTC"),
  base: z.object({
    priceUsd: usd6Schema,
    collateralRatioBps: ratioBpsSchema,
    liquidationPriceUsd: usd6Schema,
  }),
  rows: z
    .array(
      z.object({
        shockBps: z.number().int().min(-9_900).max(0), // −1000 = −10%
        priceUsd: usd6Schema,
        collateralRatioBps: ratioBpsSchema,
        band: z.enum(["healthy", "near_liquidation", "liquidatable"]),
        requested: z.boolean(), // the user's "−35%"
        isLiquidationRow: z.boolean(), // "BTC −X% = liquidation"
      }),
    )
    .min(1)
    .max(8),
  thresholds: z.object({
    minCollateralRatioBps: ratioBpsSchema,
    nearBandBps: ratioBpsSchema,
  }),
  requestedOutcome: z
    .enum(["safe", "near_liquidation", "liquidated"])
    .nullable(),
  snapshotBlock: uintStringSchema,
})

const reviewEffectSchema = z.object({
  key: z.string().max(40),
  label: z.string().max(40),
  before: z.string().max(60), // formatted from facts
  after: z.string().max(60).nullable(),
  unchanged: z.boolean(),
  factRefs: z.array(z.string()),
})

// Frame 43 "Review repayment" (corrected: no approval, liq. price changes).
export const repayReviewBlockSchema = z.object({
  ...blockBase,
  type: z.literal("repay_review"),
  proposalId: z.string().max(40),
  title: z.string().max(80),
  amount: tokenAmountSchema,
  effects: z.array(reviewEffectSchema).max(12),
  approval: z.literal("not_required"), // repayMUSD burns; no allowance read
  simulation: z.enum(["passed", "reverted", "not_run"]),
  signatures: z.object({ count: z.literal(1), atomic: z.literal(true) }),
  irreversibilityNote: z.literal("repay_not_reversible"),
})

// Rewards "Claim all" and collateral-surplus claims.
export const claimReviewBlockSchema = z.object({
  ...blockBase,
  type: z.literal("claim_review"),
  proposalId: z.string().max(40).nullable(),
  rows: z.array(claimRowSchema).max(64),
  totalUsd: usd6Schema.nullable(),
  unpricedCount: z.number().int().min(0),
  signatures: z.object({
    count: z.number().int().min(0),
    atomic: z.boolean(),
  }),
  irreversibilityNote: z.literal("claim_final"),
})

export const clarificationCardBlockSchema = z.object({
  ...blockBase,
  type: z.literal("clarification_card"),
  cardId: clarificationCardIdSchema,
  prompt: z.string().max(120),
  options: z
    .array(
      z.object({
        id: z.string().max(80),
        label: z.string().max(60),
        detail: z.string().max(160),
        availability: z.enum(["available", "unavailable"]),
      }),
    )
    .min(2)
    .max(6),
})

export const activityTraceBlockSchema = z.object({
  ...blockBase,
  type: z.literal("activity_trace"),
  items: z.array(traceItemSchema).max(16),
})

export const bridgeRecordSchema = z.object({
  id: z.string().max(120),
  provider: z.enum(["Wormhole", "LayerZero", "Native"]),
  direction: z.enum(["in", "out"]),
  sourceChain: z.string().max(40),
  destinationChain: z.string().max(40),
  sourceAsset: z.string().max(40),
  destinationAsset: z.string().max(40),
  sourceAmount: z.string().max(80),
  destinationAmount: z.string().max(80),
  usdValue: usd6Schema.nullable(),
  feeUsd: usd6Schema.nullable(),
  status: z.enum(["completed", "pending", "failed"]),
  happenedAt: z.string().max(40),
  sourceHash: z.string().max(140),
  destinationHash: z.string().max(140).nullable(),
})

export const bridgeRecordsBlockSchema = z.object({
  ...blockBase,
  type: z.literal("bridge_records"),
  records: z.array(bridgeRecordSchema).max(100),
  providerFilter: z.string().max(40).nullable(),
  totalUsd: usd6Schema.nullable(),
})

// "Sources · …" chip row. Chips are `evidenceRefs` resolved against
// `response.evidence`.
export const sourceClusterBlockSchema = z.object({
  ...blockBase,
  type: z.literal("source_cluster"),
})

// One gauge explained (palette "Why is Stackbridge APY down?"): identity,
// this epoch's incentives, weight, boost, optimal veMEZO and recent epochs.
export const gaugeExplainBlockSchema = z.object({
  ...blockBase,
  type: z.literal("gauge_explain"),
  target: z.object({
    targetAddress: addressSchema,
    name: z.string().max(80), // untrusted profile text: render escaped
    nameSource: z.enum(["profile", "derived"]),
    tokenId: uintStringSchema.nullable(), // veBTC #id behind a boost gauge
    branch: voteBranchSchema,
    isAlive: z.boolean(),
  }),
  incentivesUsd: usd6Schema.nullable(), // null = unpriced, never $0
  pricingStatus: z.enum(["complete", "partial", "unpriced"]),
  incentives: z.array(tokenAmountSchema).max(16), // this epoch
  weight: tokenAmountSchema, // current votes on the target
  apyBps: z.number().int().nullable(),
  boostWad: uintStringSchema.nullable(), // 1e18 = 1×
  optimalVeMEZO: tokenAmountSchema.nullable(), // weight that reaches 5×
  additionalVeMEZO: tokenAmountSchema.nullable(),
  epochs: z
    .array(
      z.object({
        epochStart: uintStringSchema,
        status: z.enum(["sealed", "current"]),
        incentivesUsd: usd6Schema.nullable(),
        apyBps: z.number().int().nullable(),
        weight: tokenAmountSchema,
        boostWad: uintStringSchema.nullable(),
      }),
    )
    .max(12),
  historyStatus: z.enum(["live", "unavailable"]),
  notSelectedReason: z
    .enum([
      "selected",
      "not_alive",
      "no_incentives",
      "unpriced",
      "below_cutoff",
      "no_eligible_locks",
    ])
    .nullable(),
  snapshotBlock: uintStringSchema,
})

export const uiBlockSchema = z.discriminatedUnion("type", [
  metricSummaryBlockSchema,
  gaugeRankingBlockSchema,
  voteComposerBlockSchema,
  allocationDiffBlockSchema,
  zapRouteBlockSchema,
  supportReportPreviewBlockSchema,
  loanPositionBlockSchema,
  liquidationScenarioBlockSchema,
  repayReviewBlockSchema,
  claimReviewBlockSchema,
  clarificationCardBlockSchema,
  activityTraceBlockSchema,
  bridgeRecordsBlockSchema,
  sourceClusterBlockSchema,
  gaugeExplainBlockSchema,
])

export const UI_BLOCK_TYPES = [
  "metric_summary",
  "gauge_ranking",
  "vote_composer",
  "allocation_diff",
  "zap_route",
  "support_report_preview",
  "loan_position",
  "liquidation_scenario",
  "repay_review",
  "claim_review",
  "clarification_card",
  "activity_trace",
  "bridge_records",
  "source_cluster",
  "gauge_explain",
] as const

// Frames 44/45 and the success toast: client dispatch state only, never sent
// by the server. Built from the proposal plus the wallet's per-call results.
export const callStatusSchema = z.object({
  type: z.literal("call_status"),
  version: z.literal(1),
  proposalId: z.string().max(40),
  outcome: z.enum(["in_progress", "success", "failed", "partial"]),
  calls: z.array(
    z.object({
      index: z.number().int().min(0),
      label: z.string().max(120),
      status: z.enum([
        "not_sent",
        "awaiting_wallet",
        "submitted",
        "mined",
        "reverted",
        "rejected",
      ]),
      hash: txHashSchema.nullable(),
      error: z.string().max(240).nullable(),
      doNotRepeat: z.boolean(),
      retryable: z.boolean(),
    }),
  ),
  remaining: tokenAmountSchema.nullable(), // "Still to repay 5,000.00 mUSD"
})

// ---------------------------------------------------------------------------
// POST /api/query

export const stuartRequestSchema = z.object({
  version: z.literal(1),
  query: z.string().trim().min(1).max(2_000),
  sessionId: z.uuid(), // tab-scoped, client generated
  turn: z.number().int().min(0).max(200),
  surface: z.enum(["palette", "rail", "canvas", "composer"]),
  chainId: chainIdSchema,
  wallet: z
    .object({
      address: addressSchema,
      mode: walletModeSchema,
      label: z.string().trim().min(1).max(80).optional(),
    })
    .optional(), // absent → zero address, inspecting
  context: z
    .object({
      page: z
        .object({
          route: z.string().max(120),
          entity: z
            .object({
              type: z.enum([
                "gauge",
                "lock",
                "trove",
                "vault",
                "epoch",
                "transaction",
              ]),
              id: z.string().max(80),
              label: z.string().max(80),
            })
            .optional(), // "Using: MEZO/MUSD Vault" chip
        })
        .optional(),
      previous: z
        .object({
          responseId: z.string().max(80),
          intent: intentSchema,
        })
        .optional(),
      clarification: z
        .object({
          cardId: clarificationCardIdSchema,
          optionId: z.string().max(80),
        })
        .optional(),
    })
    .default({}),
})

export const stuartResponseSchema = z.object({
  version: z.literal(1),
  responseId: z.string().max(80), // `q_<requestId>`
  requestId: z.uuid(),
  intent: intentSchema,
  title: z.string().max(120), // "Best return for my veMEZO this epoch"
  generatedAt: z.iso.datetime(),
  snapshot: z.object({
    chainId: chainIdSchema,
    blockNumber: uintStringSchema.nullable(),
    epoch: z.number().int().nullable(),
    label: z.string().max(120), // "No financial tool called yet"
  }),
  wallet: z.object({
    address: addressSchema,
    mode: walletModeSchema,
    label: z.string().max(80),
    network: z.enum(["Mezo Mainnet", "Mezo Testnet"]),
  }),
  answer: answerSchema,
  why: whySchema.nullable(),
  facts: z.array(factSchema).max(64),
  evidence: z.array(evidenceSchema).max(24),
  uiBlocks: z.array(uiBlockSchema).max(12),
  proposedActions: z.array(proposalSchema).max(4),
  followups: z.array(followupSchema).max(4),
  presentation: z.object({
    surface: z.enum(["rail", "canvas"]), // rail = frame 33, canvas = frame 32
    openCanvas: z.boolean(),
  }),
  service: z.object({
    runtime: z.enum(["claude", "deterministic"]),
    model: z.string().max(60).nullable(),
    degraded: z.boolean(),
    notice: z.string().max(200).nullable(), // fixed copy, never model text
    rateLimited: z.boolean(),
  }),
})

// ---------------------------------------------------------------------------
// POST /api/proposal/refresh

export const ballotEditSchema = z.object({
  ballotKey: z.string().max(80),
  selected: z.boolean(),
  allocations: z
    .array(
      z.object({
        targetId: z.string().max(80),
        bps: z.number().int().min(1).max(10_000),
      }),
    )
    .min(1)
    .max(30),
})

export const proposalRefreshRequestSchema = z.object({
  version: z.literal(1),
  proposal: proposalSchema,
  wallet: z.object({ address: addressSchema, mode: walletModeSchema }),
  edits: z
    .object({
      ballots: z.array(ballotEditSchema).max(64).optional(),
      slippageBps: bpsSchema.optional(), // zap only
    })
    .optional(),
  manualOverride: z.boolean().default(false),
  acceptNewOptimum: z.boolean().default(false), // frame 38 "Acknowledge new optimum"
})

export const materialityReasonSchema = z.enum([
  "allocation_pp",
  "projected_pct",
  "target_set",
  "ballot_set",
  "quote",
  "approval",
  "can_sign",
  "position",
])

export const proposalRefreshResponseSchema = z.object({
  version: z.literal(1),
  proposal: proposalSchema, // fresh id/hash/token/expiry
  // Fresh optimum when manual edits were preserved (frame 38 right action).
  recommended: proposalSchema.nullable(),
  preservedManualEdits: z.boolean(),
  material: z.boolean(), // true → acknowledge before any wallet prompt
  reasons: z.array(materialityReasonSchema),
  diff: allocationDiffBlockSchema.nullable(), // vote proposals
  changes: z
    .array(
      z.object({
        key: z.string().max(40),
        label: z.string().max(40),
        before: z.string().max(60),
        after: z.string().max(60),
        material: z.boolean(),
      }),
    )
    .max(16), // non-vote proposals (quote, debt, claimable)
  evidence: z.array(evidenceSchema).max(24),
  activityTrace: z.array(traceItemSchema).max(16),
})

// ---------------------------------------------------------------------------
// POST /api/support-report (only after the user presses "Submit report")

export const supportReportSubmitSchema = z.object({
  version: z.literal(1),
  draft: supportReportDraftSchema, // exactly as received; token-verified
  problemStatement: z.string().trim().min(10).max(2_000), // user-edited text
  // Subset of draft.included[].itemId the user kept. Non-removable items are
  // always kept.
  includedItemIds: z.array(z.string().max(40)).max(20),
  wallet: z
    .object({ address: addressSchema, mode: walletModeSchema })
    .optional(),
  contact: z.discriminatedUnion("method", [
    z.object({ method: z.literal("thread_only") }),
    z.object({
      method: z.literal("email"),
      email: z.email().max(200),
      consent: z.literal(true),
    }),
  ]),
})

export const supportReportSubmitResponseSchema = z.object({
  version: z.literal(1),
  ref: z.string().regex(/^SR-[A-F0-9]{6}$/),
  // sha256 of the canonical JSON that was stored: equals what was previewed.
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.literal("received"),
})

// ---------------------------------------------------------------------------
// Error envelope for every non-2xx from these routes.

export const stuartErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "invalid_request",
      "forbidden_origin",
      "unsupported_media_type",
      "payload_too_large",
      "rate_limited",
      "invalid_proposal",
      "proposal_expired",
      "wallet_mismatch",
      "support_unavailable",
      "internal",
    ]),
    message: z.string().max(200),
    retryAfterSeconds: z.number().int().min(0).nullable(),
  }),
})

// GET /api/query/status — palette switch for frames 12/12b.
export const stuartStatusSchema = z.object({
  stuart: z.enum(["claude", "deterministic"]),
  model: z.string().max(60).nullable(),
  supportReports: z.boolean(),
})

// ---------------------------------------------------------------------------
// Types

export type Address = z.infer<typeof addressSchema>
export type TokenAmount = z.infer<typeof tokenAmountSchema>
export type ValueStatus = z.infer<typeof valueStatusSchema>
export type WalletMode = z.infer<typeof walletModeSchema>
export type VoteBranch = z.infer<typeof voteBranchSchema>
export type Intent = z.infer<typeof intentSchema>
export type ClarificationCardId = z.infer<typeof clarificationCardIdSchema>
export type Evidence = z.infer<typeof evidenceSchema>
export type Fact = z.infer<typeof factSchema>
export type FactValue = z.infer<typeof factValueSchema>
export type TraceItem = z.infer<typeof traceItemSchema>
export type Answer = z.infer<typeof answerSchema>
export type Why = z.infer<typeof whySchema>
export type Followup = z.infer<typeof followupSchema>
export type TransactionRequest = z.infer<typeof transactionRequestSchema>
export type Approval = z.infer<typeof approvalSchema>
export type Simulation = z.infer<typeof simulationSchema>
export type Quote = z.infer<typeof quoteSchema>
export type Ballot = z.infer<typeof ballotSchema>
export type BallotAllocation = z.infer<typeof ballotAllocationSchema>
export type ClaimRow = z.infer<typeof claimRowSchema>
export type ClaimSourceKind = z.infer<typeof claimSourceKindSchema>
export type ProposalContent = z.infer<typeof proposalContentSchema>
export type Proposal = z.infer<typeof proposalSchema>
export type MetricSummaryBlock = z.infer<typeof metricSummaryBlockSchema>
export type GaugeRankingBlock = z.infer<typeof gaugeRankingBlockSchema>
export type VoteComposerBlock = z.infer<typeof voteComposerBlockSchema>
export type AllocationDiffBlock = z.infer<typeof allocationDiffBlockSchema>
export type ZapRouteBlock = z.infer<typeof zapRouteBlockSchema>
export type SupportReportItem = z.infer<typeof supportReportItemSchema>
export type SupportReportDraft = z.infer<typeof supportReportDraftSchema>
export type SupportReportPreviewBlock = z.infer<
  typeof supportReportPreviewBlockSchema
>
export type LoanPositionBlock = z.infer<typeof loanPositionBlockSchema>
export type LiquidationScenarioBlock = z.infer<
  typeof liquidationScenarioBlockSchema
>
export type RepayReviewBlock = z.infer<typeof repayReviewBlockSchema>
export type ClaimReviewBlock = z.infer<typeof claimReviewBlockSchema>
export type ClarificationCardBlock = z.infer<
  typeof clarificationCardBlockSchema
>
export type ActivityTraceBlock = z.infer<typeof activityTraceBlockSchema>
export type BridgeRecord = z.infer<typeof bridgeRecordSchema>
export type BridgeRecordsBlock = z.infer<typeof bridgeRecordsBlockSchema>
export type SourceClusterBlock = z.infer<typeof sourceClusterBlockSchema>
export type GaugeExplainBlock = z.infer<typeof gaugeExplainBlockSchema>
export type UiBlock = z.infer<typeof uiBlockSchema>
export type UiBlockType = UiBlock["type"]
export type CallStatus = z.infer<typeof callStatusSchema>
export type StuartRequest = z.input<typeof stuartRequestSchema>
export type ParsedStuartRequest = z.infer<typeof stuartRequestSchema>
export type StuartResponse = z.infer<typeof stuartResponseSchema>
export type BallotEdit = z.infer<typeof ballotEditSchema>
export type ProposalRefreshRequest = z.input<
  typeof proposalRefreshRequestSchema
>
export type ParsedProposalRefreshRequest = z.infer<
  typeof proposalRefreshRequestSchema
>
export type MaterialityReason = z.infer<typeof materialityReasonSchema>
export type ProposalRefreshResponse = z.infer<
  typeof proposalRefreshResponseSchema
>
export type SupportReportSubmit = z.infer<typeof supportReportSubmitSchema>
export type SupportReportSubmitResponse = z.infer<
  typeof supportReportSubmitResponseSchema
>
export type StuartError = z.infer<typeof stuartErrorSchema>
export type StuartStatus = z.infer<typeof stuartStatusSchema>
