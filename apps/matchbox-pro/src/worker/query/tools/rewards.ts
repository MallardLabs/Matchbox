import { encodeFunctionData } from "viem"
import { z } from "zod"
import type {
  ClaimRow,
  ClaimSourceKind,
  Evidence,
  Fact,
  Proposal,
  TransactionRequest,
  UiBlock,
  VoteBranch,
} from "../../../features/query/contract"
import {
  displayBlock,
  displayUsd,
  microFromUsd6,
  tokenAmount,
  usd6,
} from "../format"
import { type ToolOutcome, makeFact, traceItem } from "../outcome"
import {
  type ProposalDraft,
  callTarget,
  expiresAt,
  sealProposal,
  signability,
  simulationOf,
} from "../proposals"
import { VOTER_ABI } from "../providers/abis"
import { type ClaimableLock, claimArguments } from "../providers/claims"
import { type PriceSnapshot, tokenMicroUsd } from "../providers/prices"
import { assetFor } from "../providers/voting"
import { CLAIM_CALC_VERSION } from "../versions"
import {
  ZERO_WALLET,
  calcEvidence,
  chainEvidence,
  errorOutcome,
  navigateFollowup,
  plainOutcome,
  priceEvidence,
  queryFollowup,
  sourceCluster,
} from "./common"
import { type ToolContext, defineTool } from "./tool"

type VoterSource = Exclude<ClaimSourceKind, "collateral_surplus">

const SOURCE_BRANCH: Record<VoterSource, VoteBranch> = {
  boost_bribes: "boost",
  pool_fees_bribes: "pools",
  validator_bribes: "validators",
}

const sourceSchema = z.enum([
  "boost_bribes",
  "pool_fees_bribes",
  "validator_bribes",
])

const SOURCE_LABEL: Record<ClaimSourceKind, string> = {
  boost_bribes: "veMEZO bribes",
  pool_fees_bribes: "veBTC pool fees + bribes",
  validator_bribes: "veBTC validator bribes",
  collateral_surplus: "BTC collateral surplus",
}

export type ClaimScan = {
  rows: ClaimRow[]
  raw: ClaimableLock[]
  prices: PriceSnapshot
  blockNumber: bigint
  fetchedAt: string
  totalMicro: bigint | null
  unpricedCount: number
}

export async function scanClaims(
  context: ToolContext,
  sources: readonly VoterSource[],
  lockIds: readonly string[] | null,
): Promise<ClaimScan> {
  const prices = await context.providers.prices()
  const perSource = await Promise.all(
    sources.map(async (source) => {
      const branch = SOURCE_BRANCH[source]
      const [domain, locks] = await Promise.all([
        context.providers.votingDomain(branch),
        context.providers.walletLocks(context.wallet.address, assetFor(branch)),
      ])
      const selected = locks.filter(
        (lock) => lockIds === null || lockIds.includes(lock.tokenId.toString()),
      )
      const claimable = selected.length
        ? await context.providers.claimable(domain, selected)
        : []
      return { domain, claimable }
    }),
  )
  const raw = perSource.flatMap((entry) => entry.claimable)
  const blockNumber = perSource.reduce(
    (max, entry) =>
      entry.domain.blockNumber > max ? entry.domain.blockNumber : max,
    0n,
  )
  let total: bigint | null = null
  let unpricedCount = 0
  const rows: ClaimRow[] = raw.map((lock) => {
    let rowUsd: bigint | null = null
    let rowUnpriced = 0
    const rewards = lock.entries.map((entry) => {
      const usd = tokenMicroUsd({
        amount: entry.earned,
        decimals: entry.decimals,
        token: entry.token,
        symbol: entry.symbol,
        prices,
      })
      if (usd === null) rowUnpriced += 1
      else rowUsd = (rowUsd ?? 0n) + usd
      return {
        token: entry.token,
        amount: tokenAmount(entry.earned, entry.decimals, entry.symbol),
        usd: usd === null ? null : usd6(usd),
      }
    })
    if (rowUsd !== null) total = (total ?? 0n) + rowUsd
    unpricedCount += rowUnpriced
    return {
      rowKey: `${lock.source}:${lock.tokenId}`,
      source: lock.source,
      contract: lock.voter,
      tokenId: lock.tokenId.toString(),
      rewards,
      usd: rowUsd === null ? null : usd6(rowUsd),
      unpricedCount: rowUnpriced,
    }
  })
  return {
    rows,
    raw,
    prices,
    blockNumber,
    fetchedAt: new Date().toISOString(),
    totalMicro: total,
    unpricedCount,
  }
}

function claimCall(
  context: ToolContext,
  lock: ClaimableLock,
  index: number,
): TransactionRequest {
  const { contracts, tokens } = claimArguments(lock.entries)
  const data =
    lock.source === "pool_fees_bribes"
      ? encodeFunctionData({
          abi: VOTER_ABI,
          functionName: "claimFeesAndBribes",
          args: [contracts, tokens, lock.tokenId],
        })
      : encodeFunctionData({
          abi: VOTER_ABI,
          functionName: "claimBribes",
          args: [contracts, tokens, lock.tokenId],
        })
  const asset = lock.source === "boost_bribes" ? "veMEZO" : "veBTC"
  return {
    index,
    chainId: 31_612,
    from: context.wallet.address,
    to: lock.voter,
    data,
    value: "0x0",
    kind: "claim",
    label: `${index + 1} · Claim ${SOURCE_LABEL[lock.source]} · ${asset} #${lock.tokenId}`,
    dependsOn: null,
    refreshAfterDependency: false,
  }
}

export async function buildClaimProposal(
  context: ToolContext,
  scan: ClaimScan,
): Promise<Proposal | null> {
  if (scan.raw.length === 0) return null
  const calls = scan.raw.map((lock, index) => claimCall(context, lock, index))
  const simulated = await Promise.all(
    calls.map((call) =>
      context.providers.simulateSingle(
        context.wallet.address,
        callTarget(call),
      ),
    ),
  )
  const simulation = simulationOf(simulated, "eth_call")
  const draft: ProposalDraft = {
    kind: "claim",
    chainId: 31_612,
    from: context.wallet.address,
    origin: "user_request",
    ...signability({
      walletMode: context.wallet.mode,
      simulation,
      blockedReason: null,
      needsApproval: false,
    }),
    createdAt: context.now().toISOString(),
    expiresAt: expiresAt("claim", context.now()),
    snapshotBlock: scan.blockNumber.toString(),
    calculationVersion: CLAIM_CALC_VERSION,
    atomicity: calls.length > 1 ? "batchable" : "single",
    approvals: [],
    calls,
    simulation,
    quote: null,
    content: {
      kind: "claim",
      rows: scan.rows,
      totalUsd: scan.totalMicro === null ? null : usd6(scan.totalMicro),
      unpricedCount: scan.unpricedCount,
    },
  }
  return sealProposal(draft, context.secret)
}

function claimsOutcome(
  context: ToolContext,
  scan: ClaimScan,
  proposal: Proposal | null,
  tool: string,
): ToolOutcome {
  const { scope } = context
  const evidence: Evidence[] = [
    chainEvidence({
      scope,
      key: "earned",
      label: "Claimable · live",
      source: "Reward contracts earned(token, tokenId)",
      blockNumber: scan.blockNumber,
      fetchedAt: scan.fetchedAt,
    }),
    priceEvidence(scope, scan.prices, "both"),
    calcEvidence(
      scope,
      CLAIM_CALC_VERSION,
      "Priced claimable rewards",
      scan.fetchedAt,
    ),
  ]
  const refs = evidence.map((item) => item.id)
  const facts: Fact[] = [
    makeFact({
      scope,
      key: "total",
      label: "Claimable (priced)",
      value:
        scan.totalMicro === null
          ? { kind: "text", text: "Unpriced" }
          : { kind: "usd", usd: usd6(scan.totalMicro) },
      display: displayUsd(scan.totalMicro),
      status: scan.totalMicro === null ? "unpriced" : "live",
      evidenceRefs: refs,
    }),
    makeFact({
      scope,
      key: "claims",
      label: "Claims",
      value: { kind: "count", count: scan.rows.length },
      display: `${scan.rows.length}`,
      status: "live",
      evidenceRefs: [refs[0] ?? ""],
    }),
  ]
  if (scan.unpricedCount > 0) {
    facts.push(
      makeFact({
        scope,
        key: "unpriced",
        label: "Unpriced rewards",
        value: { kind: "count", count: scan.unpricedCount },
        display: `${scan.unpricedCount}`,
        status: "unpriced",
        evidenceRefs: [refs[1] ?? ""],
      }),
    )
  }
  const [totalFact, countFact, unpricedFact] = facts
  const text = `Claimable: ${totalFact?.display} across ${countFact?.display} claims.${
    unpricedFact ? ` ${unpricedFact.display} rewards are unpriced.` : ""
  }`
  const blocks: UiBlock[] = [
    {
      type: "claim_review",
      version: 1,
      id: scope.id("b.claims"),
      evidenceRefs: refs,
      proposalId: proposal?.proposalId ?? null,
      rows: scan.rows,
      totalUsd: scan.totalMicro === null ? null : usd6(scan.totalMicro),
      unpricedCount: scan.unpricedCount,
      signatures: {
        count: proposal?.calls.length ?? 0,
        atomic: (proposal?.calls.length ?? 0) <= 1,
      },
      irreversibilityNote: "claim_final",
    },
    sourceCluster(scope, evidence),
  ]
  return {
    tool,
    intent: "claim_rewards",
    status: "ok",
    title: "Claimable rewards",
    snapshot: {
      blockNumber: scan.blockNumber,
      epoch: null,
      label: `block ${displayBlock(scan.blockNumber)}`,
    },
    answer: {
      kind: "result",
      templateId: `${tool}.lead.v1`,
      text,
      factRefs: facts.map((fact) => fact.id),
    },
    why: null,
    facts,
    evidence,
    blocks,
    proposals: proposal ? [proposal] : [],
    followups: proposal
      ? [navigateFollowup(scope, "rewards", "Open Rewards", "/rewards")]
      : [
          queryFollowup(scope, "claim", "Claim all", "claim all my rewards"),
          navigateFollowup(scope, "rewards", "Open Rewards", "/rewards"),
        ],
    trace: [
      traceItem({
        scope,
        key: "scan",
        label: `Read claimable rewards for ${scan.rows.length} lock sources`,
        tool,
      }),
    ],
    model: {
      rows: [
        {
          total: displayUsd(scan.totalMicro),
          claims: `${scan.rows.length}`,
          unpriced: `${scan.unpricedCount}`,
        },
        ...scan.rows.map((row) => ({
          source: SOURCE_LABEL[row.source],
          lock: row.tokenId ? `#${row.tokenId}` : null,
          usd:
            row.usd === null ? "Unpriced" : displayUsd(microFromUsd6(row.usd)),
        })),
      ],
      notes: proposal
        ? [
            `Unsigned claim proposal ${proposal.proposalId}: ${proposal.status}.`,
          ]
        : [],
    },
    surface: proposal ? "canvas" : "rail",
  }
}

const rewardsInput = z.object({
  sources: z
    .array(sourceSchema)
    .min(1)
    .max(3)
    .nullable()
    .describe("Reward sources; null = all three."),
  lockIds: z.array(z.string().regex(/^\d+$/)).max(64).nullable(),
})

const ALL_SOURCES: VoterSource[] = [
  "boost_bribes",
  "pool_fees_bribes",
  "validator_bribes",
]

async function runRewards(
  context: ToolContext,
  input: z.infer<typeof rewardsInput>,
  prepare: boolean,
): Promise<ToolOutcome> {
  const tool = prepare ? "prepare_claim" : "list_claimable_rewards"
  if (context.wallet.address === ZERO_WALLET) {
    return plainOutcome({
      scope: context.scope,
      tool,
      intent: "claim_rewards",
      status: "empty",
      title: "Claimable rewards",
      templateId: `${tool}.no_wallet.v1`,
      text: "Connect or watch a wallet to see claimable rewards.",
      kind: "empty",
      traceLabel: "No wallet selected",
    })
  }
  try {
    const scan = await scanClaims(
      context,
      input.sources ?? ALL_SOURCES,
      input.lockIds,
    )
    if (scan.rows.length === 0) {
      return plainOutcome({
        scope: context.scope,
        tool,
        intent: "claim_rewards",
        status: "empty",
        title: "Claimable rewards",
        templateId: `${tool}.empty.v1`,
        text: "Nothing to claim for this wallet right now.",
        kind: "empty",
        traceLabel: "Read claimable rewards",
        evidence: [
          chainEvidence({
            scope: context.scope,
            key: "earned",
            label: "Claimable · live",
            source: "Reward contracts earned(token, tokenId)",
            blockNumber: scan.blockNumber,
            fetchedAt: scan.fetchedAt,
          }),
        ],
      })
    }
    const proposal = prepare ? await buildClaimProposal(context, scan) : null
    return claimsOutcome(context, scan, proposal, tool)
  } catch {
    return errorOutcome({
      scope: context.scope,
      tool,
      intent: "claim_rewards",
      title: "Claimable rewards",
    })
  }
}

export const listClaimableTool = defineTool({
  name: "list_claimable_rewards",
  family: "rewards",
  description:
    "Claimable voting rewards for the selected wallet: veMEZO bribes (boost gauges), veBTC pool fees + bribes, veBTC validator bribes. Read only.",
  input: rewardsInput,
  run: (context, input) => runRewards(context, input, false),
})

export const prepareClaimTool = defineTool({
  name: "prepare_claim",
  family: "rewards",
  description:
    "Prepare unsigned claim transactions (one per lock and voter) for the selected wallet's claimable rewards. Use when the user asks to claim.",
  input: rewardsInput,
  run: (context, input) => runRewards(context, input, true),
})
