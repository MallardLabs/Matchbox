import {
  type QueryResponse,
  type WalletContext,
  optimizeVotesResultSchema,
  prepareVoteResultSchema,
  prepareZapResultSchema,
  queryResponseSchema,
  rankGaugesResultSchema,
  searchTransactionsResultSchema,
} from "@repo/matchbox-mcp"
import { Money } from "@thesis-co/cent"

export type ServiceState = {
  runtime: "groq" | "deterministic"
  model: string | null
  degraded: boolean
  notice: string | null
  requestId: string
}

type PresentationInput = {
  query: string
  toolName: string | null
  toolResult: unknown
  wallet: WalletContext
  service: ServiceState
  supportAnswer?: string | null
}

export type ClarificationKind = "gauge-objective" | "earn-destination"

export function presentClarificationResponse(input: {
  kind: ClarificationKind
  wallet: WalletContext
  service: ServiceState
}): QueryResponse {
  const gauge = input.kind === "gauge-objective"
  return queryResponseSchema.parse({
    id: `clarification-${input.service.requestId}`,
    kind: "clarification",
    title: gauge ? "What does best mean here?" : "Choose an Earn destination",
    answer: gauge
      ? "Gauge rankings answer different questions. Choose the objective you want; only personal return runs the Optimizer."
      : "MUSD Savings is a direct single-asset deposit. LP pools need two assets and an approved zap router, which is not configured in this prototype.",
    generatedAt: new Date().toISOString(),
    snapshotLabel: "No financial tool called yet",
    wallet: input.wallet,
    blocks: [
      {
        type: "clarification_card",
        prompt: gauge
          ? "Choose a gauge objective"
          : "Choose the destination you intended",
        options: gauge
          ? [
              {
                id: "best-personal-return",
                label: "Best return for me",
                description:
                  "Maximize projected personal voting-incentive USD with the canonical Optimizer.",
                query: "optimize my votes for the best personal return",
                availability: "available",
              },
              {
                id: "most-incentives-deposited",
                label: "Most incentives deposited",
                description:
                  "Rank gross currently deposited incentive USD without optimizing a ballot.",
                query: "show gauges with the most incentives deposited",
                availability: "available",
              },
              {
                id: "most-consistently-funded",
                label: "Most consistently funded",
                description:
                  "Rank the funded-epoch rate over the last 8 completed epochs.",
                query: "show the most consistently funded gauges",
                availability: "available",
              },
            ]
          : [
              {
                id: "musd-savings",
                label: "Deposit MUSD into Savings",
                description:
                  "Direct single-sided deposit with an exact approval only when required.",
                query: "deposit 50 MUSD into Savings",
                availability: "available",
              },
              {
                id: "lp-pool-zap",
                label: "Zap into an LP pool",
                description:
                  "Requires an approved dual-deposit router and remains unavailable this increment.",
                query: "zap 50 MUSD into the MEZO/MUSD LP pool",
                availability: "unavailable",
              },
            ],
      },
    ],
    followups: [],
    evidence: [],
    service: input.service,
  })
}

function money(value: string): string {
  return Money(`USD ${value}`).toString()
}

function bridgeResponse(input: PresentationInput): QueryResponse {
  const result = searchTransactionsResultSchema.parse(input.toolResult)
  const completed = result.records.filter(
    (record) => record.status === "completed",
  )
  const completedValue = completed.reduce(
    (total, record) => total.add(Money(`USD ${record.usdValue}`)),
    Money("USD 0"),
  )
  const pending = result.records.filter(
    (record) => record.status === "pending",
  ).length
  const providerFilter = /wormhole|portal/i.test(input.query)
    ? "Wormhole"
    : null
  return queryResponseSchema.parse({
    id: `bridge-${input.service.requestId}`,
    kind: "bridge",
    title: providerFilter ? "Wormhole transactions" : "Bridge transactions",
    answer:
      result.records.length === 0
        ? "No explicitly linked Wormhole journeys involving this wallet and Mezo were found. I did not scan matching addresses on unrelated chains."
        : `${result.records.length} explicitly linked bridge journeys found. ${completed.length} completed for ${completedValue.toString()}${pending ? `; ${pending} pending` : ""}.`,
    generatedAt: result.source.fetchedAt,
    snapshotLabel:
      result.source.status === "live"
        ? "Live provider snapshot"
        : "Labeled prototype fixture data",
    wallet: input.wallet,
    blocks: [
      {
        type: "bridge_records",
        records: result.records,
        providerFilter,
      },
      {
        type: "activity_trace",
        items: [
          {
            label: "Resolved wallet context",
            detail: `${input.wallet.mode} · 1 Mezo address`,
          },
          {
            label: "Queried explicit bridge links",
            detail: `${result.records.length} linked journeys involving Mezo`,
          },
        ],
      },
    ],
    followups: [
      "Only show transfers into Mezo",
      "Which gauges have the most incentives?",
      "Vote on the best gauges this epoch",
    ],
    evidence: [
      {
        source: result.source.name,
        ...(result.source.url ? { url: result.source.url } : {}),
        fetchedAt: result.source.fetchedAt,
        status: result.source.status,
      },
    ],
    service: {
      ...input.service,
      notice: result.source.notice ?? input.service.notice,
    },
  })
}

function rankingResponse(input: PresentationInput): QueryResponse {
  const result = rankGaugesResultSchema.parse(input.toolResult)
  const gauges = result.gauges.map((gauge) => ({
    ...gauge,
    projectedReturnUsd: "0",
    allocationPercentage: 0,
  }))
  const leader = gauges[0]
  return queryResponseSchema.parse({
    id: `gauges-${input.service.requestId}`,
    kind: "vote",
    title: result.objective,
    answer: leader
      ? `${leader.name} ranks first for ${result.objective.toLowerCase()}. It currently shows ${money(leader.depositedUsd)} in priced incentives and was funded in ${leader.consistencyBps / 100}% of the last 8 completed epochs.`
      : "No funded gauges were found in the current indexed snapshot.",
    generatedAt: result.snapshot.generatedAt,
    snapshotLabel: `Mezo Mainnet · block ${result.snapshot.blockNumber}`,
    wallet: input.wallet,
    blocks: [
      {
        type: "gauge_ranking",
        gauges,
        objective: result.objective,
        projectedTotalUsd: null,
        calculationVersion: "matchbox-live-ranking-v1",
      },
      {
        type: "activity_trace",
        items: [
          {
            label: "Loaded live gauge universe",
            detail: `${gauges.length} ranked results`,
          },
          {
            label: "Applied requested objective",
            detail: result.objective,
          },
        ],
      },
    ],
    followups: [
      "Vote on the best gauges this epoch",
      "Show the most consistently funded gauges",
      "Which validator has the most incentives?",
    ],
    evidence: [
      {
        source: result.snapshot.source.name,
        url: result.snapshot.source.url,
        fetchedAt: result.snapshot.generatedAt,
        status: "live",
      },
    ],
    service: input.service,
  })
}

function voteResponse(input: PresentationInput): QueryResponse {
  const optimized =
    input.toolName === "optimize_votes"
      ? optimizeVotesResultSchema.parse(input.toolResult)
      : null
  const proposal =
    optimized?.proposal ?? prepareVoteResultSchema.parse(input.toolResult)
  const ballots = optimized?.ballots ?? proposal.ballots
  const gauges = ballots.flatMap((ballot) =>
    ballot.allocations.map((allocation) => ({
      id: allocation.gaugeId,
      address: allocation.gaugeAddress,
      name: allocation.gaugeName,
      type: allocation.gaugeType,
      governanceAsset: ballot.governanceAsset,
      votingBucket: ballot.votingBucket,
      depositedUsd: allocation.depositedUsd,
      projectedReturnUsd: allocation.projectedReturnUsd,
      consistencyBps: allocation.consistencyBps,
      allocationPercentage: allocation.percentage,
      tokenPair: allocation.tokenPair,
      pricingStatus: allocation.pricingStatus,
    })),
  )
  const hasBallot = ballots.length > 0
  const answer = optimized
    ? hasBallot
      ? `The ruthless Optimizer prepared ${ballots.length} independent ballot${ballots.length === 1 ? "" : "s"}, projecting ${money(optimized.projectedTotalUsd)} in personal incentives at this snapshot. Every request remains unsigned.`
      : `${optimized.notices.join(" ")} I can still rank live gauges, but I will not invent an executable ballot.`
    : hasBallot
      ? "I resolved your percentages against live gauges and simulated the unsigned ballot. Review every allocation before opening your wallet."
      : (proposal.simulation.reason ??
        "No executable ballot could be prepared.")
  return queryResponseSchema.parse({
    id: `vote-${input.service.requestId}`,
    kind: "vote",
    title: optimized ? "Best personal return" : "Review your requested vote",
    answer,
    generatedAt: optimized?.generatedAt ?? new Date().toISOString(),
    snapshotLabel: `Mezo Mainnet · block ${proposal.snapshotBlock}`,
    wallet: input.wallet,
    blocks: [
      ...(optimized
        ? [
            {
              type: "gauge_ranking" as const,
              gauges,
              objective: "Best personal return" as const,
              projectedTotalUsd: optimized.projectedTotalUsd,
              calculationVersion: optimized.calculationVersion,
            },
          ]
        : []),
      {
        type: "vote_composer",
        ...proposal,
        ballots,
      },
      {
        type: "activity_trace",
        items: [
          {
            label: "Resolved live wallet positions",
            detail: `${optimized?.positions.length ?? ballots.length} eligible position${(optimized?.positions.length ?? ballots.length) === 1 ? "" : "s"}`,
          },
          {
            label: optimized
              ? "Ran ruthless Optimizer"
              : "Resolved requested gauges",
            detail: `${gauges.length} allocations across ${ballots.length} ballot${ballots.length === 1 ? "" : "s"}`,
          },
          {
            label: "Simulated unsigned requests",
            detail: `${proposal.simulation.calls} calls · ${proposal.simulation.status}`,
          },
        ],
      },
    ],
    followups: [
      "Show the most incentives deposited",
      "Show the most consistently funded gauges",
      "Deposit 50 MUSD into Savings",
    ],
    evidence: [
      {
        source: optimized?.calculationVersion ?? "live-user-ballot-v1",
        fetchedAt: optimized?.generatedAt ?? new Date().toISOString(),
        status: "deterministic",
      },
      ...(optimized
        ? [
            {
              source: "Matchbox mainnet indexer + Mezo RPC",
              fetchedAt: optimized.generatedAt,
              status: "live" as const,
            },
          ]
        : []),
    ],
    service: input.service,
  })
}

function earnResponse(input: PresentationInput): QueryResponse {
  const result = prepareZapResultSchema.parse(input.toolResult)
  return queryResponseSchema.parse({
    id: `earn-${input.service.requestId}`,
    kind: "zap",
    title:
      result.status === "unavailable"
        ? "Earn route unavailable"
        : `Deposit ${result.amount} ${result.fundingAsset}`,
    answer: result.notice,
    generatedAt: new Date().toISOString(),
    snapshotLabel: "Mezo Mainnet · live contract checks",
    wallet: input.wallet,
    blocks: [{ type: "zap_route", ...result }],
    followups: [
      "Deposit 50 MUSD into Savings",
      "Show my Earn positions",
      "Explain MUSD Savings",
    ],
    evidence: [
      {
        source: "Mezo mainnet contracts",
        fetchedAt: new Date().toISOString(),
        status: "live",
      },
    ],
    service: input.service,
  })
}

function supportResponse(input: PresentationInput): QueryResponse {
  return queryResponseSchema.parse({
    id: `support-${input.service.requestId}`,
    kind: "support",
    title: "Ask Stuart anything about Mezo",
    answer:
      input.supportAnswer?.trim() ||
      `I couldn’t map “${input.query}” to a connected Matchbox tool yet.`,
    generatedAt: new Date().toISOString(),
    snapshotLabel: "Stuart service alpha",
    wallet: input.wallet,
    blocks: [],
    followups: [
      "Wormhole transactions",
      "Vote on the best gauges this epoch",
      "Deposit 50 MUSD into Savings",
    ],
    evidence: [],
    service: input.service,
  })
}

export function presentQueryResponse(input: PresentationInput): QueryResponse {
  if (input.toolName === "search_transactions") return bridgeResponse(input)
  if (input.toolName === "rank_gauges") return rankingResponse(input)
  if (
    input.toolName === "optimize_votes" ||
    input.toolName === "prepare_vote"
  ) {
    return voteResponse(input)
  }
  if (input.toolName === "prepare_zap") return earnResponse(input)
  return supportResponse(input)
}
