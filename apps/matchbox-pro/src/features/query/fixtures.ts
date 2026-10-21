import type { Ballot, Proposal, StuartResponse, UiBlock } from "./contract"

// Test-only builders (never imported by app code): contract-valid Stuart
// payloads for unit tests and layout checks against the Pencil frames.

export const WALLET = "0x3D41aB2c9e8F7a6B5c4D3e2F1a0B9c8D7e6F9DC3"
const VOTER = "0x2Ba6000000000000000000000000000000013d1A"
const GENERATED = "2026-10-21T12:00:00.000Z"

const ALLOCATIONS: [string, number, string][] = [
  ["Stackbridge", 4200, "18.100000"],
  ["tBTC / WBTC", 3300, "14.050000"],
  ["Lombard", 2500, "11.050000"],
]

export function ballotFixture(tokenId: string): Ballot {
  return {
    ballotKey: `boost:${tokenId}`,
    branch: "boost",
    governanceAsset: "veMEZO",
    votingContract: VOTER,
    tokenId,
    votingPower: "12400000000000000000000",
    selected: true,
    allocations: ALLOCATIONS.map(([name, bps, usd], index) => ({
      targetId: `g${index}`,
      targetAddress: `0x${String(index + 1).repeat(40)}`,
      name,
      bps,
      projectedUsd: usd,
    })),
  }
}

export function proposalFixture(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposalId: "vote_1a2b3c4d",
    proposalHash: `0x${"ab".repeat(32)}`,
    refreshToken: "cd".repeat(32),
    kind: "vote",
    chainId: 31_612,
    from: WALLET,
    origin: "optimizer",
    status: "unsigned",
    canSign: true,
    blockedReason: null,
    createdAt: GENERATED,
    expiresAt: "2026-10-21T12:15:00.000Z",
    snapshotBlock: "4128440",
    calculationVersion: "calc v1.4.2",
    atomicity: "sequential_non_atomic",
    approvals: [],
    calls: ["4821", "4966"].map((tokenId, index) => ({
      index,
      chainId: 31_612 as const,
      from: WALLET,
      to: VOTER,
      data: `0x7ac09bf${index}`,
      value: "0x0" as const,
      kind: "vote" as const,
      label: `Vote veMEZO #${tokenId}`,
      dependsOn: null,
      refreshAfterDependency: false,
    })),
    simulation: {
      status: "passed",
      method: "eth_call",
      calls: [0, 1].map((index) => ({
        index,
        status: "passed" as const,
        gasEstimate: "210000",
        reason: null,
      })),
    },
    quote: null,
    content: {
      kind: "vote",
      ballots: [ballotFixture("4821"), ballotFixture("4966")],
      manualOverride: false,
      projectedUsd: "86.400000",
      projectedNative: {
        raw: "1024800000000000000000",
        decimals: 18,
        symbol: "MEZO",
      },
    },
    ...overrides,
  }
}

const evidence: StuartResponse["evidence"] = [
  {
    id: "ev-gauges",
    kind: "chain",
    label: "Boost gauges · live",
    source: "BoostVoter 0x2Ba6…13d1",
    blockNumber: "4128440",
    fetchedAt: GENERATED,
    status: "live",
  },
  {
    id: "ev-prices",
    kind: "price",
    label: "Prices · Skip oracle",
    source: "Skip oracle (Mezo)",
    fetchedAt: GENERATED,
    status: "live",
  },
  {
    id: "ev-epoch",
    kind: "chain",
    label: "Epoch 126 · 2d 14h",
    source: "BoostVoter epoch",
    epoch: 126,
    fetchedAt: GENERATED,
    status: "live",
  },
  {
    id: "ev-calc",
    kind: "calculation",
    label: "Calc v1.4.2",
    source: "rewardOptimizer",
    fetchedAt: GENERATED,
    status: "deterministic",
    calculationVersion: "calc v1.4.2",
  },
]

const rankingBlocks: UiBlock[] = [
  {
    type: "metric_summary",
    version: 1,
    id: "lead",
    evidenceRefs: ["ev-gauges"],
    label: "Projected this epoch",
    primaryUsd: "86.400000",
    primaryStatus: "projected",
    secondary: { raw: "1024800000000000000000", decimals: 18, symbol: "MEZO" },
    apyBps: 1480,
    apyStatus: "extrapolated",
    objectiveNote: "maximize_projected_personal_usd",
    snapshotBlock: "4128440",
  },
  {
    type: "gauge_ranking",
    version: 1,
    id: "ranking",
    evidenceRefs: ["ev-gauges"],
    objective: "best_personal_return",
    domain: {
      branch: "boost",
      governanceAsset: "veMEZO",
      votingContract: VOTER,
    },
    epoch: {
      number: 126,
      start: "1760918400",
      endsAt: "2026-10-23T00:00:00.000Z",
    },
    snapshotBlock: "4128440",
    calculationVersion: "calc v1.4.2",
    consistencyWindow: 8,
    rows: (
      [
        ["Stackbridge", "221", 4200, "36.200000", "428400000000000000000", 8],
        ["tBTC / WBTC", "305", 3300, "28.100000", "332200000000000000000", 8],
        ["Lombard", "418", 2500, "22.100000", "264200000000000000000", 7],
      ] as const
    ).map(([name, tokenId, bps, usd, native, funded], index) => ({
      targetId: `g${index}`,
      targetAddress: `0x${String(index + 1).repeat(40)}`,
      name,
      nameSource: "profile" as const,
      tokenId,
      allocationBps: bps,
      projectedUsd: usd,
      projectedNative: { raw: native, decimals: 18, symbol: "MEZO" },
      depositedUsd: null,
      pricingStatus: "complete" as const,
      fundedEpochs: funded,
      observedEpochs: 8,
      competingWeight: "1000000000000000000000",
    })),
    proposalId: "vote_1a2b3c4d",
    actions: ["review_vote", "edit_allocation"],
  },
  {
    type: "activity_trace",
    version: 1,
    id: "trace",
    evidenceRefs: [],
    items: [
      {
        id: "t1",
        label: "Compared 42 gauges at block 4,128,440",
        detail: null,
        tool: "optimize_votes",
        durationMs: 840,
        status: "ok",
      },
    ],
  },
]

export function responseFixture(
  overrides: Partial<StuartResponse> = {},
): StuartResponse {
  return {
    version: 1,
    responseId: "q_7f3a19c0",
    requestId: "7f3a19c0-1111-4222-8333-444455556666",
    intent: "optimize_votes",
    title: "Best return for my veMEZO this epoch",
    generatedAt: GENERATED,
    snapshot: {
      chainId: 31_612,
      blockNumber: "4128440",
      epoch: 126,
      label: "Boost gauges",
    },
    wallet: {
      address: WALLET,
      mode: "connected",
      label: "0x3D41…9DC3",
      network: "Mezo Mainnet",
    },
    answer: {
      kind: "result",
      origin: "template",
      templateId: "optimize_votes.lead.v1",
      text: "Projected this epoch: $86.40 if you allocate 42% Stackbridge, 33% tBTC/WBTC, 25% Lombard on veMEZO #4821 and #4966.",
      factRefs: [],
      evidenceRefs: ["ev-gauges"],
    },
    why: {
      templateId: "optimize_votes.why.v1",
      items: [
        {
          text: "Stackbridge has the highest priced incentives vs current weight. Dilution uses the live vote snapshot, not a forecast.",
          factRefs: [],
        },
      ],
    },
    facts: [],
    evidence,
    uiBlocks: rankingBlocks,
    proposedActions: [proposalFixture()],
    followups: [],
    presentation: { surface: "canvas", openCanvas: true },
    service: {
      runtime: "claude",
      model: "claude-haiku-5-5",
      degraded: false,
      notice: null,
      rateLimited: false,
    },
    ...overrides,
  }
}
