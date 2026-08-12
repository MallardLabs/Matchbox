import { type QueryResponse, queryResponseSchema } from "./contracts"
import { bridgeRecords, demoWallet, gauges } from "./fixtures"

const generatedAt = "2026-08-11T14:02:00.000Z"

function base(input: {
  id: string
  kind: QueryResponse["kind"]
  title: string
  answer: string
  blocks: QueryResponse["blocks"]
  followups: string[]
}): QueryResponse {
  return queryResponseSchema.parse({
    ...input,
    generatedAt,
    snapshotLabel: "Labeled prototype fixture data",
    wallet: demoWallet,
    evidence: [],
  })
}

function bridgeResponse(provider: "Wormhole" | null): QueryResponse {
  const records = provider
    ? bridgeRecords.filter((record) => record.provider === provider)
    : bridgeRecords
  return base({
    id: provider ? "wormhole-transactions" : "bridge-transactions",
    kind: "bridge",
    title: provider ? "Wormhole transactions" : "Bridge transactions",
    answer: `${records.length} explicitly linked bridge journeys are shown as labeled prototype data.`,
    blocks: [
      { type: "bridge_records", records, providerFilter: provider },
      {
        type: "activity_trace",
        items: [
          { label: "Resolved demo wallet", detail: demoWallet.address },
          {
            label: "Matched linked legs",
            detail: `${records.length} journeys`,
          },
        ],
      },
    ],
    followups: [
      "Only show transfers into Mezo",
      "Vote on the best gauges this epoch",
    ],
  })
}

function voteResponse(): QueryResponse {
  const poolGauges = gauges.filter(
    (gauge) => gauge.votingBucket === "pool-gauges",
  )
  const ballot = {
    votingContract: "0x48233cCC97B87Ba93bCA212cbEe48e3210211f03",
    votingBucket: "pool-gauges",
    governanceAsset: "veBTC" as const,
    position: {
      governanceAsset: "veBTC" as const,
      tokenId: "184",
      votingPower: "48420910000000000000000",
      votingPowerFormatted: "48420.91",
    },
    allocations: poolGauges.map((gauge, index) => ({
      gaugeId: gauge.id,
      gaugeAddress: gauge.address,
      gaugeName: gauge.name,
      gaugeType: gauge.type,
      tokenPair: gauge.tokenPair,
      pricingStatus: gauge.pricingStatus,
      percentage: [46, 31, 23][index] ?? 0,
      basisPoints: ([46, 31, 23][index] ?? 0) * 100,
      depositedUsd: gauge.depositedUsd,
      projectedReturnUsd: gauge.projectedReturnUsd,
      consistencyBps: gauge.consistencyBps,
    })),
    projectedReturnUsd: "404.93",
  }
  return base({
    id: "best-gauges-vote",
    kind: "vote",
    title: "Best personal return",
    answer:
      "This is labeled demo output. Live Query replaces it with indexed gauges, owned locks, and simulated unsigned calls.",
    blocks: [
      {
        type: "gauge_ranking",
        gauges,
        objective: "Best personal return",
        projectedTotalUsd: "471.74",
        calculationVersion: "optimizer-demo-v1",
      },
      {
        type: "vote_composer",
        proposalId: "vote_demo0001",
        proposalHash: `0x${"1".repeat(64)}`,
        chainId: 31_612,
        from: demoWallet.address,
        origin: "optimizer",
        expiresAt: "2026-08-11T14:17:00.000Z",
        canSign: false,
        status: "blocked",
        ballots: [ballot],
        transactionRequests: [],
        simulation: {
          status: "not-run",
          calls: 0,
          gasEstimate: null,
          reason: "Fixture output is never wallet-executable.",
          results: [
            {
              label: "Vote pool-gauges with veBTC #184",
              status: "not-run",
              gasEstimate: null,
              reason: "Fixture output is never wallet-executable.",
            },
          ],
        },
        snapshotBlock: "12482113",
      },
    ],
    followups: [
      "Show the most incentives deposited",
      "Deposit 50 MUSD into Savings",
    ],
  })
}

function earnResponse(amount = "50"): QueryResponse {
  return base({
    id: "earn-unavailable",
    kind: "zap",
    title: "Earn route unavailable",
    answer:
      "No approved MEZO/MUSD zap router is configured, so this demo does not fabricate a route.",
    blocks: [
      {
        type: "zap_route",
        proposalId: "savings_demo0001",
        proposalHash: `0x${"2".repeat(64)}`,
        chainId: 31_612,
        from: demoWallet.address,
        origin: "savings",
        expiresAt: "2026-08-11T14:17:00.000Z",
        snapshotBlock: "unavailable",
        status: "unavailable",
        canSign: false,
        amount,
        fundingAsset: "MUSD",
        vault: "MEZO / MUSD Earn Vault",
        vaultAddress: null,
        route: [
          { label: "Requested", value: `${amount} MUSD` },
          { label: "Route", value: "Awaiting approved zap router" },
        ],
        balance: null,
        allowance: null,
        transactionRequests: [],
        simulation: {
          status: "not-run",
          calls: 0,
          gasEstimate: null,
          reason: "No approved Matchbox zap router is configured.",
        },
        notice: "No transaction was invented.",
      },
    ],
    followups: ["Deposit 50 MUSD into Savings", "Explain MUSD Savings"],
  })
}

function supportResponse(input: string): QueryResponse {
  return base({
    id: "stuart-support",
    kind: "support",
    title: "Ask Stuart anything about Mezo",
    answer: `This prototype did not map “${input}” to a rich block.`,
    blocks: [],
    followups: [
      "Wormhole transactions",
      "Vote on the best gauges this epoch",
      "Deposit 50 MUSD into Savings",
    ],
  })
}

export function runDemoQuery(input: string): QueryResponse {
  const normalized = input.trim().toLowerCase()
  if (normalized.includes("wormhole") || normalized.includes("portal")) {
    return bridgeResponse("Wormhole")
  }
  if (normalized.includes("bridge")) return bridgeResponse(null)
  if (
    normalized.includes("vote") ||
    normalized.includes("best gauge") ||
    normalized.includes("optimizer")
  ) {
    return voteResponse()
  }
  if (
    normalized.includes("zap") ||
    normalized.includes("vault") ||
    normalized.includes("earn deposit")
  ) {
    return earnResponse(normalized.match(/\$\s?(\d+(?:\.\d{1,2})?)/)?.[1])
  }
  return supportResponse(input.trim() || "Help me get started")
}
