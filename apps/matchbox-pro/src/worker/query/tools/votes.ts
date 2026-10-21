import { type Address, encodeFunctionData, getAddress } from "viem"
import { z } from "zod"
import type {
  Ballot,
  Evidence,
  Fact,
  GaugeRankingBlock,
  Proposal,
  UiBlock,
  VoteBranch,
} from "../../../features/query/contract"
import { calculateAnnualizedReturnBasisPoints } from "../../../lib/rewardOptimizer"
import {
  clipName,
  displayBlock,
  displayBps,
  displayToken,
  displayUsd,
  listWithAnd,
  tokenAmount,
  usd6,
} from "../format"
import {
  type ModelRow,
  type ToolOutcome,
  makeFact,
  traceItem,
} from "../outcome"
import {
  type ProposalDraft,
  expiresAt,
  sealProposal,
  signability,
  simulationOf,
} from "../proposals"
import { VOTER_ABI } from "../providers/abis"
import { priceMicroUsd } from "../providers/prices"
import type { PriceSnapshot } from "../providers/prices"
import {
  type VotingDomain,
  type WalletLock,
  assetFor,
} from "../providers/voting"
import { OPTIMIZER_CALC_VERSION, epochNumberFor } from "../versions"
import {
  type PricedTarget,
  lockShare,
  nativeShares,
  optimizeCapped,
  optimizerGauges,
  percentToBps,
  priceTarget,
  projectAllocation,
  singleTokenTotal,
  targetApyBps,
} from "../voteMath"
import { rankByApy } from "./apyRank"
import {
  ZERO_WALLET,
  calcEvidence,
  chainEvidence,
  domainEvidence,
  errorOutcome,
  navigateFollowup,
  plainOutcome,
  priceEvidence,
  queryFollowup,
  snapshotLabel,
  sourceCluster,
} from "./common"
import { type ToolContext, defineTool } from "./tool"

const branchSchema = z.enum(["boost", "validators", "pools"])
const VOTE_WINDOW_MARGIN = 3_600n
// Above 10,000% an extrapolated APY says nothing useful; show none.
const MAX_APY_BPS = 1_000_000n

export type VotePlan = {
  branch: VoteBranch
  domain: VotingDomain
  prices: PriceSnapshot
  eligible: WalletLock[]
  alreadyVoted: WalletLock[]
  priced: Map<string, PricedTarget>
  bps: Map<string, bigint>
  windowOpen: boolean
}

function nowSeconds(context: ToolContext): bigint {
  return BigInt(Math.floor(context.now().getTime() / 1000))
}

/** Reads everything one voting domain needs and runs the optimizer. */
export async function planVotes(
  context: ToolContext,
  input: {
    branch: VoteBranch
    lockIds: readonly string[] | null
    manual: ReadonlyMap<string, bigint> | null
  },
): Promise<VotePlan | null> {
  const { providers, wallet } = context
  const asset = assetFor(input.branch)
  const [domain, prices, locks] = await Promise.all([
    providers.votingDomain(input.branch),
    providers.prices(),
    wallet.address === ZERO_WALLET
      ? Promise.resolve([])
      : providers.walletLocks(wallet.address, asset),
  ])
  const withPower = locks.filter(
    (lock) =>
      lock.votingPower > 0n &&
      (input.lockIds === null ||
        input.lockIds.includes(lock.tokenId.toString())),
  )
  const candidates = domain.targets.filter(
    (target) => target.isAlive && target.incentives.length > 0,
  )
  const states = withPower.length
    ? await providers.lockVoteState(
        input.branch,
        withPower.map((lock) => lock.tokenId),
        candidates.map((target) => target.targetAddress),
      )
    : []
  const stateById = new Map(states.map((state) => [state.tokenId, state]))
  const eligible = withPower.filter(
    (lock) =>
      (stateById.get(lock.tokenId)?.lastVoted ?? 0n) < domain.epochStart,
  )
  const alreadyVoted = withPower.filter((lock) => !eligible.includes(lock))
  // Only the re-voting locks' standing votes are reset by `vote()`.
  const ownVotes = new Map<string, bigint>()
  for (const lock of eligible) {
    for (const [target, weight] of stateById.get(lock.tokenId)?.votes ?? []) {
      ownVotes.set(target, (ownVotes.get(target) ?? 0n) + weight)
    }
  }
  const priced = new Map(
    domain.targets.map((target) => {
      const key = target.targetAddress.toLowerCase()
      return [key, priceTarget(target, prices, ownVotes.get(key) ?? 0n)]
    }),
  )
  const now = nowSeconds(context)
  const windowOpen =
    now >= domain.epochStart + VOTE_WINDOW_MARGIN &&
    now < domain.epochNext - VOTE_WINDOW_MARGIN
  const bps =
    input.manual ??
    (eligible.length
      ? optimizeCapped({
          gauges: optimizerGauges([...priced.values()]),
          votingPowers: eligible.map((lock) => lock.votingPower),
          maxTargets: domain.maxVotingNum,
        })
      : null)
  if (bps === null && eligible.length > 0) return null
  return {
    branch: input.branch,
    domain,
    prices,
    eligible,
    alreadyVoted,
    priced,
    bps: new Map(bps ?? []),
    windowOpen,
  }
}

function assetPrice(plan: VotePlan): bigint | null {
  return priceMicroUsd(
    plan.branch === "boost"
      ? plan.prices.mezo.priceUsd
      : plan.prices.btc.priceUsd,
  )
}

export type VotePresentation = {
  outcome: ToolOutcome
  proposal: Proposal | null
}

function lockLabel(asset: string, lock: WalletLock): string {
  return `${asset} #${lock.tokenId}`
}

/** Builds facts, blocks, the unsigned proposal and the template answer. */
export async function presentVotePlan(
  context: ToolContext,
  plan: VotePlan,
  input: {
    tool: string
    intent: "optimize_votes" | "custom_vote" | "rank_gauges"
    origin: Proposal["origin"]
  },
): Promise<VotePresentation> {
  const { scope } = context
  const asset = assetFor(plan.branch)
  const gauges = optimizerGauges([...plan.priced.values()])
  const powers = plan.eligible.map((lock) => lock.votingPower)
  const projection = projectAllocation({
    gauges,
    votingPowers: powers,
    bps: plan.bps,
  })
  const rows = [...projection.perTarget.entries()]
    .map(([id, value]) => ({ id, ...value, priced: plan.priced.get(id) }))
    .filter((row) => row.priced !== undefined && row.bps > 0n)
    .sort((left, right) =>
      left.bps === right.bps
        ? left.projected === right.projected
          ? left.id.localeCompare(right.id)
          : left.projected > right.projected
            ? -1
            : 1
        : left.bps > right.bps
          ? -1
          : 1,
    )

  const evidence: Evidence[] = [
    domainEvidence(scope, plan.domain),
    priceEvidence(
      scope,
      plan.prices,
      plan.branch === "boost" ? "mezo" : "both",
    ),
    calcEvidence(
      scope,
      OPTIMIZER_CALC_VERSION,
      "Reward optimizer (closed form, bps)",
      plan.domain.fetchedAt,
    ),
    chainEvidence({
      scope,
      key: "locks",
      label: `${asset} locks · live`,
      source: `${asset} escrow`,
      blockNumber: plan.domain.blockNumber,
      fetchedAt: plan.domain.fetchedAt,
    }),
  ]
  const [domainRef, priceRef, calcRef, lockRef] = evidence.map(
    (item) => item.id,
  )
  const allRefs = evidence.map((item) => item.id)
  const facts: Fact[] = []
  const add = (fact: Fact): Fact => {
    facts.push(fact)
    return fact
  }

  const projectedFact = add(
    makeFact({
      scope,
      key: "projected",
      label: "Projected this epoch",
      value: { kind: "usd", usd: usd6(projection.total) },
      display: displayUsd(projection.total),
      status: "projected",
      evidenceRefs: allRefs,
    }),
  )
  const rowShares = rows.map((row) =>
    nativeShares({
      incentives: row.priced?.target.incentives ?? [],
      voteWeight: row.voteWeight,
      competing: row.competing,
    }),
  )
  const totalNative = singleTokenTotal(rowShares.flat())
  const nativeAmount = totalNative
    ? tokenAmount(totalNative.amount, totalNative.decimals, totalNative.symbol)
    : null
  if (nativeAmount) {
    add(
      makeFact({
        scope,
        key: "native",
        label: "Native equivalent",
        value: { kind: "token", amount: nativeAmount },
        display: displayToken(nativeAmount),
        status: "projected",
        evidenceRefs: [domainRef ?? "", calcRef ?? ""],
      }),
    )
  }
  const price = assetPrice(plan)
  const apy =
    price !== null && projection.total > 0n
      ? calculateAnnualizedReturnBasisPoints({
          epochRewardMicroUsd: projection.total,
          votingPowers: powers,
          assetPriceMicroUsd: price,
        })
      : null
  if (apy !== null && apy <= MAX_APY_BPS) {
    add(
      makeFact({
        scope,
        key: "apy",
        label: "APY (extrapolated)",
        value: { kind: "bps", bps: Number(apy) },
        display: displayBps(Number(apy)),
        status: "estimated",
        evidenceRefs: [calcRef ?? "", priceRef ?? ""],
      }),
    )
  }
  add(
    makeFact({
      scope,
      key: "block",
      label: "Snapshot block",
      value: { kind: "block", block: plan.domain.blockNumber.toString() },
      display: displayBlock(plan.domain.blockNumber),
      status: "live",
      evidenceRefs: [domainRef ?? ""],
    }),
  )

  const topRows = rows.slice(0, 3)
  const allocationParts = topRows.map((row, index) => {
    const name = clipName(row.priced?.target.name ?? row.id, 24)
    const alloc = add(
      makeFact({
        scope,
        key: `alloc.${index}`,
        label: "Allocation",
        value: { kind: "bps", bps: Number(row.bps) },
        display: displayBps(Number(row.bps)),
        status: "projected",
        evidenceRefs: [calcRef ?? ""],
      }),
    )
    const nameFact = add(
      makeFact({
        scope,
        key: `name.${index}`,
        label: "Target",
        value: { kind: "text", text: name },
        display: name,
        status: "live",
        evidenceRefs: [domainRef ?? ""],
      }),
    )
    add(
      makeFact({
        scope,
        key: `proj.${index}`,
        label: "Projected",
        value: { kind: "usd", usd: usd6(row.projected) },
        display: displayUsd(row.projected),
        status: "projected",
        evidenceRefs: [calcRef ?? ""],
      }),
    )
    return {
      text: `${alloc.display} ${nameFact.display}`,
      refs: [alloc.id, nameFact.id],
    }
  })
  const moreCount = rows.length - topRows.length
  const moreFact =
    moreCount > 0
      ? add(
          makeFact({
            scope,
            key: "more",
            label: "More targets",
            value: { kind: "count", count: moreCount },
            display: `${moreCount} more`,
            status: "projected",
            evidenceRefs: [calcRef ?? ""],
          }),
        )
      : null
  const lockFacts =
    plan.eligible.length <= 2
      ? plan.eligible.map((lock, index) =>
          add(
            makeFact({
              scope,
              key: `lock.${index}`,
              label: "Lock",
              value: { kind: "text", text: `#${lock.tokenId}` },
              display: `#${lock.tokenId}`,
              status: "live",
              evidenceRefs: [lockRef ?? ""],
            }),
          ),
        )
      : [
          add(
            makeFact({
              scope,
              key: "locks",
              label: "Eligible locks",
              value: { kind: "count", count: plan.eligible.length },
              display: `${plan.eligible.length}`,
              status: "live",
              evidenceRefs: [lockRef ?? ""],
            }),
          ),
        ]
  const locksText =
    plan.eligible.length <= 2
      ? `${asset} ${listWithAnd(lockFacts.map((fact) => fact.display))}`
      : `${lockFacts[0]?.display ?? ""} ${asset} locks`
  const allocationText = moreFact
    ? `${allocationParts.map((part) => part.text).join(", ")} and ${moreFact.display}`
    : listWithAnd(allocationParts.map((part) => part.text))

  // --- proposal -----------------------------------------------------------
  const ballots: Ballot[] = plan.eligible.map((lock) => ({
    ballotKey: `${plan.branch}:${lock.tokenId}`,
    branch: plan.branch,
    governanceAsset: asset,
    votingContract: plan.domain.voter,
    tokenId: lock.tokenId.toString(),
    votingPower: lock.votingPower.toString(),
    selected: true,
    allocations: rows.map((row) => ({
      targetId: row.id,
      targetAddress: getAddress(row.id),
      name: (row.priced?.target.name ?? row.id).slice(0, 80),
      bps: Number(row.bps),
      projectedUsd: usd6(
        lockShare({
          projected: row.projected,
          voteWeight: row.voteWeight,
          lockPower: lock.votingPower,
          bps: row.bps,
        }),
      ),
    })),
  }))
  let proposal: Proposal | null = null
  if (ballots.length > 0 && rows.length > 0) {
    const calls = plan.eligible.map((lock, index) => ({
      index,
      chainId: 31_612 as const,
      from: context.wallet.address,
      to: plan.domain.voter,
      data: encodeFunctionData({
        abi: VOTER_ABI,
        functionName: "vote",
        args: [
          lock.tokenId,
          rows.map((row): Address => getAddress(row.id)),
          rows.map((row) => row.bps),
        ],
      }),
      value: "0x0" as const,
      kind: "vote" as const,
      label: `${index + 1} · Vote with ${lockLabel(asset, lock)}`,
      dependsOn: null,
      refreshAfterDependency: false,
    }))
    const simulated = await Promise.all(
      calls.map((call) =>
        context.providers.simulateSingle(context.wallet.address, {
          to: call.to,
          data: call.data,
        }),
      ),
    )
    const simulation = simulationOf(simulated, "eth_call")
    const draft: ProposalDraft = {
      kind: "vote",
      chainId: 31_612,
      from: context.wallet.address,
      origin: input.origin,
      ...signability({
        walletMode: context.wallet.mode,
        simulation,
        blockedReason: plan.windowOpen ? null : "voting_window_closed",
        needsApproval: false,
      }),
      createdAt: context.now().toISOString(),
      expiresAt: expiresAt("vote", context.now()),
      snapshotBlock: plan.domain.blockNumber.toString(),
      calculationVersion: OPTIMIZER_CALC_VERSION,
      atomicity: calls.length > 1 ? "sequential_non_atomic" : "single",
      approvals: [],
      calls,
      simulation,
      quote: null,
      content: {
        kind: "vote",
        ballots,
        manualOverride: input.origin === "manual",
        projectedUsd: usd6(projection.total),
        projectedNative: nativeAmount,
      },
    }
    proposal = await sealProposal(draft, context.secret)
    evidence.push(
      chainEvidence({
        scope,
        key: "sim",
        label: `Simulated · ${simulation.status}`,
        source: "eth_call per ballot",
        blockNumber: plan.domain.blockNumber,
        fetchedAt: context.now().toISOString(),
      }),
    )
  }

  // --- blocks ---------------------------------------------------------------
  const epochStart = plan.domain.epochStart
  const ranking: GaugeRankingBlock = {
    type: "gauge_ranking",
    version: 1,
    id: scope.id("b.ranking"),
    evidenceRefs: allRefs,
    objective: "best_personal_return",
    domain: {
      branch: plan.branch,
      governanceAsset: asset,
      votingContract: plan.domain.voter,
    },
    epoch: {
      number: epochNumberFor(epochStart),
      start: epochStart.toString(),
      endsAt: new Date(Number(plan.domain.epochNext) * 1000).toISOString(),
    },
    snapshotBlock: plan.domain.blockNumber.toString(),
    calculationVersion: OPTIMIZER_CALC_VERSION,
    consistencyWindow: null,
    rows: rows.slice(0, 50).map((row, index) => {
      const share = rowShares[index] ?? []
      const native = singleTokenTotal(share)
      return {
        targetId: row.id,
        targetAddress: getAddress(row.id),
        name: (row.priced?.target.name ?? row.id).slice(0, 80),
        nameSource: row.priced?.target.nameSource ?? "derived",
        tokenId: row.priced?.target.tokenId ?? null,
        allocationBps: Number(row.bps),
        projectedUsd: usd6(row.projected),
        projectedNative: native
          ? tokenAmount(native.amount, native.decimals, native.symbol)
          : null,
        depositedUsd: usd6(row.priced?.incentiveMicroUsd ?? 0n),
        pricingStatus: row.priced?.pricingStatus ?? "unpriced",
        fundedEpochs: null,
        observedEpochs: null,
        competingWeight: row.competing.toString(),
        apyBps: targetApyBps({
          incentiveMicroUsd: row.priced?.incentiveMicroUsd ?? 0n,
          weight: row.priced?.target.weight ?? 0n,
          assetPriceMicroUsd: price,
        }),
      }
    }),
    proposalId: proposal?.proposalId ?? null,
    actions: proposal
      ? ["review_vote", "edit_allocation", "open_vote_page"]
      : ["open_vote_page"],
  }
  const blocks: UiBlock[] = [
    {
      type: "metric_summary",
      version: 1,
      id: scope.id("b.summary"),
      evidenceRefs: allRefs,
      label: "Projected this epoch",
      primaryUsd: usd6(projection.total),
      primaryStatus: "projected",
      secondary: nativeAmount,
      apyBps: apy !== null && apy <= MAX_APY_BPS ? Number(apy) : null,
      apyStatus: apy !== null ? "extrapolated" : null,
      objectiveNote: "maximize_projected_personal_usd",
      snapshotBlock: plan.domain.blockNumber.toString(),
    },
    ranking,
  ]
  if (proposal && proposal.content.kind === "vote") {
    blocks.push({
      type: "vote_composer",
      version: 1,
      id: scope.id("b.composer"),
      evidenceRefs: allRefs,
      proposalId: proposal.proposalId,
      ballots: proposal.content.ballots,
      editable: true,
      manualOverride: input.origin === "manual",
      nonAtomicNotice: proposal.content.ballots.length > 1,
    })
  }
  blocks.push(sourceCluster(scope, evidence))

  // --- why ------------------------------------------------------------------
  const whyItems: Array<{ text: string; factRefs: string[] }> = []
  const topName = facts.find((fact) => fact.id === scope.id("name.0"))
  if (topName) {
    whyItems.push({
      text: `${topName.display} has the highest priced incentives vs current weight. Dilution uses the live vote snapshot, not a forecast.`,
      factRefs: [topName.id],
    })
  }
  if (plan.alreadyVoted.length > 0) {
    const skipped = add(
      makeFact({
        scope,
        key: "skipped",
        label: "Locks already voted",
        value: { kind: "count", count: plan.alreadyVoted.length },
        display: `${plan.alreadyVoted.length}`,
        status: "live",
        evidenceRefs: [lockRef ?? ""],
      }),
    )
    whyItems.push({
      text: `${skipped.display} ${asset} locks already voted this epoch and are not in this ballot.`,
      factRefs: [skipped.id],
    })
  }
  const partial = [...plan.priced.values()].filter(
    (entry) => entry.target.isAlive && entry.pricingStatus !== "complete",
  ).length
  if (partial > 0) {
    const unpriced = add(
      makeFact({
        scope,
        key: "unpriced",
        label: "Targets with unpriced incentives",
        value: { kind: "count", count: partial },
        display: `${partial}`,
        status: "unpriced",
        evidenceRefs: [priceRef ?? ""],
      }),
    )
    whyItems.push({
      text: `Unpriced incentives on ${unpriced.display} targets are excluded from USD, never counted as $0.`,
      factRefs: [unpriced.id],
    })
  }
  if (!plan.windowOpen) {
    whyItems.push({
      text: "Voting is closed in the first and last hour of an epoch.",
      factRefs: [],
    })
  }

  const modelRows: ModelRow[] = [
    {
      projected: projectedFact.display,
      native: nativeAmount ? displayToken(nativeAmount) : null,
      apy: apy !== null && apy <= MAX_APY_BPS ? displayBps(Number(apy)) : null,
      block: displayBlock(plan.domain.blockNumber),
      targets: `${rows.length}`,
    },
    ...rows.slice(0, 10).map((row) => ({
      name: row.priced?.target.name ?? row.id,
      alloc: displayBps(Number(row.bps)),
      projected: displayUsd(row.projected),
    })),
    ...plan.eligible.map((lock) => ({ lock: `#${lock.tokenId}` })),
  ]
  const answerText = `Projected this epoch: ${projectedFact.display} if you allocate ${allocationText} on ${locksText}.`
  const answerRefs = [
    projectedFact.id,
    ...allocationParts.flatMap((part) => part.refs),
    ...(moreFact ? [moreFact.id] : []),
    ...lockFacts.map((fact) => fact.id),
  ]
  const title =
    input.intent === "custom_vote"
      ? `Your ${asset} ballot`
      : `Best return for my ${asset} this epoch`
  const outcome: ToolOutcome = {
    tool: input.tool,
    intent: input.intent,
    status: "ok",
    title,
    snapshot: {
      blockNumber: plan.domain.blockNumber,
      epoch: epochNumberFor(epochStart),
      label: snapshotLabel({
        blockNumber: plan.domain.blockNumber,
        epochStart,
      }),
    },
    answer: {
      kind: "result",
      templateId: `${input.tool}.lead.v1`,
      text: answerText.slice(0, 400),
      factRefs: answerRefs,
    },
    why: whyItems.length
      ? { templateId: `${input.tool}.why.v1`, items: whyItems.slice(0, 6) }
      : null,
    facts,
    evidence,
    blocks,
    proposals: proposal ? [proposal] : [],
    followups: [
      navigateFollowup(scope, "vote", "Open Vote", "/vote"),
      queryFollowup(
        scope,
        "incentives",
        "Most incentives deposited",
        "which gauges have the most incentives deposited",
      ),
    ],
    trace: [
      traceItem({
        scope,
        key: "compare",
        label: `Compared ${plan.domain.targets.length} targets at block ${displayBlock(plan.domain.blockNumber)}`,
        tool: input.tool,
      }),
      traceItem({
        scope,
        key: "locks",
        label: `Loaded ${plan.eligible.length} eligible ${asset} locks`,
        tool: input.tool,
      }),
      ...(proposal
        ? [
            traceItem({
              scope,
              key: "sim",
              label: `Simulated ${proposal.calls.length} ballot transactions`,
              detail: proposal.simulation.status,
              tool: input.tool,
            }),
          ]
        : []),
    ],
    model: {
      rows: modelRows,
      notes: [
        proposal
          ? `Unsigned proposal ${proposal.proposalId}: ${proposal.status}${proposal.blockedReason ? ` (${proposal.blockedReason})` : ""}.`
          : "No proposal.",
      ],
    },
    surface: "canvas",
  }
  return { outcome, proposal }
}

function noLocksOutcome(
  context: ToolContext,
  tool: string,
  intent: "optimize_votes" | "custom_vote",
  asset: string,
  reason: "no_wallet" | "no_locks" | "all_voted",
): ToolOutcome {
  const text =
    reason === "no_wallet"
      ? "Connect or watch a wallet to optimize votes."
      : reason === "all_voted"
        ? `Every ${asset} lock already voted this epoch.`
        : `No ${asset} lock with voting power for this wallet.`
  return plainOutcome({
    scope: context.scope,
    tool,
    intent,
    status: "empty",
    title: `Best return for my ${asset} this epoch`,
    templateId: `${tool}.empty.${reason}.v1`,
    text,
    kind: "empty",
    traceLabel: "Checked eligible locks",
    followups: [
      queryFollowup(
        context.scope,
        "incentives",
        "Most incentives deposited",
        "which gauges have the most incentives deposited",
      ),
    ],
  })
}

export const optimizeVotesTool = defineTool({
  name: "optimize_votes",
  family: "votes",
  description:
    "Best personal return: runs the Matchbox reward optimizer for the selected wallet's eligible locks in one voting domain (boost = veMEZO on boost gauges; validators / pools = veBTC) and prepares unsigned ballots. Use for 'what should I vote', 'optimize my votes', 'best return for me'.",
  input: z.object({
    branch: branchSchema
      .nullable()
      .describe("Voting domain; null means boost (veMEZO)."),
    lockIds: z
      .array(z.string().regex(/^\d+$/))
      .max(64)
      .nullable()
      .describe("Restrict to these lock token ids; null = all eligible."),
  }),
  async run(context, input) {
    const branch = input.branch ?? "boost"
    const asset = assetFor(branch)
    if (context.wallet.address === ZERO_WALLET) {
      return noLocksOutcome(
        context,
        "optimize_votes",
        "optimize_votes",
        asset,
        "no_wallet",
      )
    }
    try {
      const plan = await planVotes(context, {
        branch,
        lockIds: input.lockIds,
        manual: null,
      })
      if (!plan || plan.eligible.length === 0 || plan.bps.size === 0) {
        return noLocksOutcome(
          context,
          "optimize_votes",
          "optimize_votes",
          asset,
          plan && plan.alreadyVoted.length > 0 ? "all_voted" : "no_locks",
        )
      }
      return (
        await presentVotePlan(context, plan, {
          tool: "optimize_votes",
          intent: "optimize_votes",
          origin: "optimizer",
        })
      ).outcome
    } catch {
      return errorOutcome({
        scope: context.scope,
        tool: "optimize_votes",
        intent: "optimize_votes",
        title: `Best return for my ${asset} this epoch`,
      })
    }
  },
})

const allocationInput = z.object({
  target: z
    .string()
    .min(1)
    .max(80)
    .describe("Gauge/validator/pool name, address, or #veBTC token id."),
  percent: z
    .string()
    .regex(/^\d{1,3}(?:\.\d{1,2})?$/)
    .describe('Percent of voting power, up to 2 decimals, e.g. "33.33".'),
})

export type TargetMatch =
  | { kind: "match"; address: string }
  | { kind: "ambiguous"; options: PricedTarget[] }
  | { kind: "none" }

export function matchTarget(
  text: string,
  priced: ReadonlyMap<string, PricedTarget>,
  options: { includeDead: boolean } = { includeDead: false },
): TargetMatch {
  const needle = text
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+(gauge|validator|pool|vault)$/, "")
  const alive = [...priced.values()].filter(
    (entry) => options.includeDead || entry.target.isAlive,
  )
  const byAddress = alive.find(
    (entry) => entry.target.targetAddress.toLowerCase() === needle,
  )
  if (byAddress) return { kind: "match", address: needle }
  const tokenId = /^#?(\d+)$/.exec(needle)?.[1]
  if (tokenId) {
    const byToken = alive.filter((entry) => entry.target.tokenId === tokenId)
    if (byToken.length === 1 && byToken[0]) {
      return {
        kind: "match",
        address: byToken[0].target.targetAddress.toLowerCase(),
      }
    }
  }
  const exact = alive.filter(
    (entry) => entry.target.name.trim().toLowerCase() === needle,
  )
  if (exact.length === 1 && exact[0]) {
    return {
      kind: "match",
      address: exact[0].target.targetAddress.toLowerCase(),
    }
  }
  if (exact.length > 1) return { kind: "ambiguous", options: exact.slice(0, 6) }
  const partial = alive.filter((entry) =>
    entry.target.name.toLowerCase().includes(needle),
  )
  if (partial.length === 1 && partial[0]) {
    return {
      kind: "match",
      address: partial[0].target.targetAddress.toLowerCase(),
    }
  }
  if (partial.length > 1)
    return { kind: "ambiguous", options: partial.slice(0, 6) }
  return { kind: "none" }
}

export const prepareVoteTool = defineTool({
  name: "prepare_vote",
  family: "votes",
  description:
    "A ballot the user specified (e.g. '30% to Stackbridge, 70% to Lombard'). Percentages must total 100. Prepares unsigned ballots for every eligible lock in one voting domain; never mixes domains.",
  input: z.object({
    branch: branchSchema.nullable(),
    allocations: z.array(allocationInput).min(1).max(30),
  }),
  async run(context, input) {
    const branch = input.branch ?? "boost"
    const asset = assetFor(branch)
    const { scope } = context
    const title = `Your ${asset} ballot`
    const total = input.allocations.reduce(
      (sum, allocation) => sum + (percentToBps(allocation.percent) ?? 0),
      0,
    )
    if (
      total !== 10_000 ||
      input.allocations.some(
        (allocation) => percentToBps(allocation.percent) === null,
      )
    ) {
      return plainOutcome({
        scope,
        tool: "prepare_vote",
        intent: "custom_vote",
        status: "unavailable",
        title,
        templateId: "prepare_vote.total.v1",
        text: "Allocations must total exactly 100%.",
        kind: "unavailable",
        traceLabel: "Checked ballot total",
      })
    }
    if (context.wallet.address === ZERO_WALLET) {
      return noLocksOutcome(
        context,
        "prepare_vote",
        "custom_vote",
        asset,
        "no_wallet",
      )
    }
    try {
      const domainPlan = await planVotes(context, {
        branch,
        lockIds: null,
        manual: new Map(),
      })
      if (!domainPlan) {
        return errorOutcome({
          scope,
          tool: "prepare_vote",
          intent: "custom_vote",
          title,
        })
      }
      const manual = new Map<string, bigint>()
      for (const allocation of input.allocations) {
        const found = matchTarget(allocation.target, domainPlan.priced)
        const chosen =
          found.kind === "ambiguous" &&
          context.choice !== null &&
          found.options.some(
            (option) =>
              option.target.targetAddress.toLowerCase() === context.choice,
          )
            ? context.choice
            : null
        const match: TargetMatch =
          chosen !== null ? { kind: "match", address: chosen } : found
        if (match.kind === "ambiguous") {
          return {
            ...plainOutcome({
              scope,
              tool: "prepare_vote",
              intent: "clarify",
              status: "clarify",
              title: "Which one?",
              templateId: "prepare_vote.disambiguate.v1",
              text: "More than one target matches. Pick one.",
              kind: "clarification",
              traceLabel: "Resolved targets",
            }),
            blocks: [
              {
                type: "clarification_card",
                version: 1,
                id: scope.id("b.card"),
                evidenceRefs: [],
                cardId: "entity-disambiguation",
                prompt: "Which target?",
                options: match.options.map((option) => ({
                  id: option.target.targetAddress.toLowerCase(),
                  label: clipName(option.target.name, 60),
                  detail: option.target.targetAddress,
                  availability: "available" as const,
                })),
              },
            ],
          }
        }
        if (match.kind === "none") {
          return plainOutcome({
            scope,
            tool: "prepare_vote",
            intent: "custom_vote",
            status: "unavailable",
            title,
            templateId: "prepare_vote.unknown_target.v1",
            text: "No live target matches one of those names.",
            kind: "unavailable",
            traceLabel: "Resolved targets",
          })
        }
        manual.set(
          match.address,
          (manual.get(match.address) ?? 0n) +
            BigInt(percentToBps(allocation.percent) ?? 0),
        )
      }
      const plan = { ...domainPlan, bps: manual }
      if (plan.eligible.length === 0) {
        return noLocksOutcome(
          context,
          "prepare_vote",
          "custom_vote",
          asset,
          plan.alreadyVoted.length > 0 ? "all_voted" : "no_locks",
        )
      }
      return (
        await presentVotePlan(context, plan, {
          tool: "prepare_vote",
          intent: "custom_vote",
          origin: "user_request",
        })
      ).outcome
    } catch {
      return errorOutcome({
        scope,
        tool: "prepare_vote",
        intent: "custom_vote",
        title,
      })
    }
  },
})

const objectiveSchema = z.enum([
  "best_personal_return",
  "most_incentives_deposited",
  "most_consistently_funded",
  "highest_apy",
])

export const rankGaugesTool = defineTool({
  name: "rank_gauges",
  family: "votes",
  description:
    "Rank voting targets. Objectives: best_personal_return (the optimizer, for the selected wallet), most_incentives_deposited (gross priced incentives this epoch), most_consistently_funded (funded epochs over the last 4/8/12 completed epochs), highest_apy (incentives per vote at current votes: 'which gauge pays the most'). Never call it for an ambiguous 'best gauges' — ask_clarification gauge-objective instead.",
  input: z.object({
    objective: objectiveSchema,
    branch: branchSchema.nullable(),
    window: z.union([z.literal(4), z.literal(8), z.literal(12)]).nullable(),
  }),
  async run(context, input) {
    const branch = input.branch ?? "boost"
    if (input.objective === "best_personal_return") {
      return optimizeVotesTool
        .execute(context, { branch, lockIds: null })
        .then((result) =>
          "invalid" in result
            ? errorOutcome({
                scope: context.scope,
                tool: "rank_gauges",
                intent: "rank_gauges",
                title: "Best return for me",
              })
            : result,
        )
    }
    if (input.objective === "highest_apy") return rankByApy(context, branch)
    const { scope } = context
    const asset = assetFor(branch)
    try {
      const [domain, prices] = await Promise.all([
        context.providers.votingDomain(branch),
        context.providers.prices(),
      ])
      const rankAssetPrice = priceMicroUsd(
        branch === "boost" ? prices.mezo.priceUsd : prices.btc.priceUsd,
      )
      const window = input.window ?? 8
      const funded =
        input.objective === "most_consistently_funded"
          ? await context.providers.fundedEpochs(domain, window)
          : null
      const priced = domain.targets
        .filter((target) => target.isAlive)
        .map((target) => priceTarget(target, prices, 0n))
      const ordered = priced
        .filter((entry) =>
          funded
            ? (funded.get(entry.target.targetAddress.toLowerCase()) ?? 0) > 0 ||
              entry.incentiveMicroUsd > 0n
            : entry.incentiveMicroUsd > 0n,
        )
        .sort((left, right) => {
          if (funded) {
            const a = funded.get(left.target.targetAddress.toLowerCase()) ?? 0
            const b = funded.get(right.target.targetAddress.toLowerCase()) ?? 0
            if (a !== b) return b - a
          }
          if (left.incentiveMicroUsd === right.incentiveMicroUsd) {
            return left.target.targetAddress.localeCompare(
              right.target.targetAddress,
            )
          }
          return left.incentiveMicroUsd > right.incentiveMicroUsd ? -1 : 1
        })
        .slice(0, 10)
      const evidence = [
        domainEvidence(scope, domain),
        priceEvidence(scope, prices, branch === "boost" ? "mezo" : "both"),
        calcEvidence(
          scope,
          OPTIMIZER_CALC_VERSION,
          funded
            ? `Funded epochs / last ${window}`
            : "Priced deposited incentives",
          domain.fetchedAt,
        ),
      ]
      const refs = evidence.map((item) => item.id)
      const first = ordered[0]
      const title =
        input.objective === "most_incentives_deposited"
          ? "Most incentives deposited"
          : "Most consistently funded"
      if (!first) {
        return plainOutcome({
          scope,
          tool: "rank_gauges",
          intent: "rank_gauges",
          status: "empty",
          title,
          templateId: "rank_gauges.empty.v1",
          text: "No priced incentives on live targets this epoch.",
          kind: "empty",
          traceLabel: "Ranked targets",
          evidence,
        })
      }
      const name = clipName(first.target.name, 32)
      const facts: Fact[] = [
        makeFact({
          scope,
          key: "name.0",
          label: "Target",
          value: { kind: "text", text: name },
          display: name,
          status: "live",
          evidenceRefs: [refs[0] ?? ""],
        }),
        makeFact({
          scope,
          key: "deposited.0",
          label: "Deposited this epoch",
          value: { kind: "usd", usd: usd6(first.incentiveMicroUsd) },
          display: displayUsd(first.incentiveMicroUsd),
          status: first.pricingStatus === "complete" ? "live" : "estimated",
          evidenceRefs: [refs[0] ?? "", refs[1] ?? ""],
        }),
      ]
      const fundedCount =
        funded?.get(first.target.targetAddress.toLowerCase()) ?? 0
      if (funded) {
        facts.push(
          makeFact({
            scope,
            key: "funded.0",
            label: "Funded epochs",
            value: { kind: "count", count: fundedCount },
            display: `${fundedCount} of the last ${window}`,
            status: "historical",
            evidenceRefs: [refs[0] ?? "", refs[2] ?? ""],
          }),
        )
      }
      const [nameFact, depositedFact, fundedFact] = facts
      const text = funded
        ? `${nameFact?.display} was funded in ${fundedFact?.display} epochs.`
        : `${nameFact?.display} has the most incentives deposited this epoch: ${depositedFact?.display}.`
      const blocks: UiBlock[] = [
        {
          type: "gauge_ranking",
          version: 1,
          id: scope.id("b.ranking"),
          evidenceRefs: refs,
          objective: input.objective,
          domain: {
            branch,
            governanceAsset: asset,
            votingContract: domain.voter,
          },
          epoch: {
            number: epochNumberFor(domain.epochStart),
            start: domain.epochStart.toString(),
            endsAt: new Date(Number(domain.epochNext) * 1000).toISOString(),
          },
          snapshotBlock: domain.blockNumber.toString(),
          calculationVersion: OPTIMIZER_CALC_VERSION,
          consistencyWindow: funded
            ? window === 4
              ? 4
              : window === 12
                ? 12
                : 8
            : null,
          rows: ordered.map((entry) => ({
            targetId: entry.target.targetAddress.toLowerCase(),
            targetAddress: entry.target.targetAddress,
            name: entry.target.name.slice(0, 80),
            nameSource: entry.target.nameSource,
            tokenId: entry.target.tokenId,
            allocationBps: null,
            projectedUsd: null,
            projectedNative: null,
            depositedUsd: usd6(entry.incentiveMicroUsd),
            pricingStatus: entry.pricingStatus,
            fundedEpochs: funded
              ? (funded.get(entry.target.targetAddress.toLowerCase()) ?? 0)
              : null,
            observedEpochs: funded ? window : null,
            competingWeight: entry.existingWeight.toString(),
            apyBps: targetApyBps({
              incentiveMicroUsd: entry.incentiveMicroUsd,
              weight: entry.target.weight,
              assetPriceMicroUsd: rankAssetPrice,
            }),
          })),
          proposalId: null,
          actions: ["open_vote_page"],
        },
        sourceCluster(scope, evidence),
      ]
      return {
        tool: "rank_gauges",
        intent: "rank_gauges",
        status: "ok",
        title,
        snapshot: {
          blockNumber: domain.blockNumber,
          epoch: epochNumberFor(domain.epochStart),
          label: snapshotLabel({
            blockNumber: domain.blockNumber,
            epochStart: domain.epochStart,
          }),
        },
        answer: {
          kind: "result",
          templateId: funded
            ? "rank_gauges.consistency.v1"
            : "rank_gauges.deposited.v1",
          text,
          factRefs: facts.map((fact) => fact.id),
        },
        why: funded
          ? {
              templateId: "rank_gauges.consistency.why.v1",
              items: [
                {
                  text: `Consistency is funded epochs out of the last ${window} completed epochs, not the final scoring formula.`,
                  factRefs: fundedFact ? [fundedFact.id] : [],
                },
              ],
            }
          : {
              templateId: "rank_gauges.deposited.why.v1",
              items: [
                {
                  text: "Gross deposited incentives are not your return; a diluted target can pay less per vote.",
                  factRefs: [],
                },
              ],
            },
        facts,
        evidence,
        blocks,
        proposals: [],
        followups: [
          queryFollowup(
            scope,
            "optimize",
            "Best return for me",
            "optimize my votes",
          ),
        ],
        trace: [
          traceItem({
            scope,
            key: "rank",
            label: `Ranked ${priced.length} live targets at block ${displayBlock(domain.blockNumber)}`,
            tool: "rank_gauges",
          }),
        ],
        model: {
          rows: ordered.map((entry) => ({
            name: entry.target.name,
            deposited: displayUsd(entry.incentiveMicroUsd),
            funded: funded
              ? `${funded.get(entry.target.targetAddress.toLowerCase()) ?? 0}/${window}`
              : null,
            pricing: entry.pricingStatus,
          })),
          notes: [],
        },
        surface: "canvas",
      }
    } catch {
      return errorOutcome({
        scope,
        tool: "rank_gauges",
        intent: "rank_gauges",
        title: "Gauge ranking",
      })
    }
  },
})
