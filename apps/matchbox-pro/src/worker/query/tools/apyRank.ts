import type {
  Fact,
  UiBlock,
  VoteBranch,
} from "../../../features/query/contract"
import {
  clipName,
  displayBlock,
  displayBps,
  displayToken,
  displayUsd,
  tokenAmount,
  usd6,
} from "../format"
import { type ToolOutcome, makeFact, traceItem } from "../outcome"
import { priceMicroUsd } from "../providers/prices"
import { assetFor } from "../providers/voting"
import { OPTIMIZER_CALC_VERSION, epochNumberFor } from "../versions"
import { compareDensity, priceTarget, targetApyBps } from "../voteMath"
import {
  FUNDED_WINDOW,
  calcEvidence,
  domainEvidence,
  errorOutcome,
  fundedForRows,
  plainOutcome,
  priceEvidence,
  queryFollowup,
  snapshotLabel,
  sourceCluster,
} from "./common"
import type { ToolContext } from "./tool"

/**
 * "Which gauge pays the most": live targets by incentives per vote (the Vote
 * page's APY ↓ sort). Not the wallet's optimum: that is optimize_votes.
 */
export async function rankByApy(
  context: ToolContext,
  branch: VoteBranch,
): Promise<ToolOutcome> {
  const tool = "rank_gauges"
  const { scope } = context
  const asset = assetFor(branch)
  const title = "Highest APY"
  try {
    const [domain, prices] = await Promise.all([
      context.providers.votingDomain(branch),
      context.providers.prices(),
    ])
    const assetPrice = priceMicroUsd(
      branch === "boost" ? prices.mezo.priceUsd : prices.btc.priceUsd,
    )
    const priced = domain.targets
      .filter((target) => target.isAlive)
      .map((target) => priceTarget(target, prices, 0n))
      .filter((entry) => entry.incentiveMicroUsd > 0n)
    const voted = priced.filter((entry) => entry.target.weight > 0n)
    const unvoted = priced.length - voted.length
    const ordered = voted.sort(compareDensity).slice(0, 10)
    const funded = await fundedForRows(
      context,
      domain,
      ordered.map((entry) => entry.target),
    )
    const evidence = [
      domainEvidence(scope, domain),
      priceEvidence(scope, prices, branch === "boost" ? "mezo" : "both"),
      calcEvidence(
        scope,
        OPTIMIZER_CALC_VERSION,
        "Incentives per vote, extrapolated APY",
        domain.fetchedAt,
      ),
    ]
    const refs = evidence.map((item) => item.id)
    const [domainRef, priceRef, calcRef] = refs
    const first = ordered[0]
    if (!first) {
      return plainOutcome({
        scope,
        tool,
        intent: "rank_gauges",
        status: "empty",
        title,
        templateId: "rank_gauges.apy_empty.v1",
        text: "No live target has priced incentives and votes this epoch.",
        kind: "empty",
        traceLabel: "Ranked targets",
        evidence,
      })
    }
    const apyOf = (entry: typeof first) =>
      targetApyBps({
        incentiveMicroUsd: entry.incentiveMicroUsd,
        weight: entry.target.weight,
        assetPriceMicroUsd: assetPrice,
      })
    const name = clipName(first.target.name, 32)
    const firstApy = apyOf(first)
    const facts: Fact[] = [
      makeFact({
        scope,
        key: "name.0",
        label: "Target",
        value: { kind: "text", text: name },
        display: name,
        status: "live",
        evidenceRefs: [domainRef ?? ""],
      }),
      makeFact({
        scope,
        key: "deposited.0",
        label: "Incentives this epoch",
        value: { kind: "usd", usd: usd6(first.incentiveMicroUsd) },
        display: displayUsd(first.incentiveMicroUsd),
        status: first.pricingStatus === "complete" ? "live" : "estimated",
        evidenceRefs: [domainRef ?? "", priceRef ?? ""],
      }),
    ]
    const [nameFact, incentivesFact] = facts
    let text: string
    if (firstApy !== null) {
      const apyFact = makeFact({
        scope,
        key: "apy.0",
        label: "APY (extrapolated)",
        value: { kind: "bps", bps: firstApy },
        display: displayBps(firstApy),
        status: "estimated",
        evidenceRefs: [calcRef ?? "", priceRef ?? ""],
      })
      facts.push(apyFact)
      text = `${nameFact?.display} pays the most per vote this epoch: APY ${apyFact.display} on ${incentivesFact?.display} incentives.`
    } else {
      const weight = tokenAmount(first.target.weight, 18, asset)
      const weightFact = makeFact({
        scope,
        key: "votes.0",
        label: "Current votes",
        value: { kind: "token", amount: weight },
        display: displayToken(weight),
        status: "live",
        evidenceRefs: [domainRef ?? ""],
      })
      facts.push(weightFact)
      text = `${nameFact?.display} pays the most per vote this epoch: ${incentivesFact?.display} incentives on ${weightFact.display}.`
    }
    const whyItems: Array<{ text: string; factRefs: string[] }> = [
      {
        text: "APY extrapolates this epoch's priced incentives at current votes. Your own return also depends on how much you add.",
        factRefs: [],
      },
    ]
    if (unvoted > 0) {
      const unvotedFact = makeFact({
        scope,
        key: "unvoted",
        label: "Funded targets with no votes",
        value: { kind: "count", count: unvoted },
        display: `${unvoted}`,
        status: "live",
        evidenceRefs: [domainRef ?? ""],
      })
      facts.push(unvotedFact)
      whyItems.push({
        text: `${unvotedFact.display} funded targets have no votes yet, so their APY is undefined and they are not ranked.`,
        factRefs: [unvotedFact.id],
      })
    }
    const blocks: UiBlock[] = [
      {
        type: "gauge_ranking",
        version: 1,
        id: scope.id("b.ranking"),
        evidenceRefs: refs,
        objective: "highest_apy",
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
        consistencyWindow: null,
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
          observedEpochs: funded ? FUNDED_WINDOW : null,
          competingWeight: entry.target.weight.toString(),
          apyBps: apyOf(entry),
        })),
        proposalId: null,
        actions: ["open_vote_page"],
      },
      sourceCluster(scope, evidence),
    ]
    return {
      tool,
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
        templateId:
          firstApy === null ? "rank_gauges.apy_votes.v1" : "rank_gauges.apy.v1",
        text,
        factRefs: facts.map((fact) => fact.id),
      },
      why: { templateId: "rank_gauges.apy.why.v1", items: whyItems },
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
          label: `Ranked ${voted.length} voted targets by APY at block ${displayBlock(domain.blockNumber)}`,
          tool,
        }),
      ],
      model: {
        rows: ordered.map((entry) => {
          const apy = apyOf(entry)
          return {
            name: entry.target.name,
            incentives: displayUsd(entry.incentiveMicroUsd),
            apy: apy === null ? null : displayBps(apy),
            votes: displayToken(tokenAmount(entry.target.weight, 18, asset)),
          }
        }),
        notes: [],
      },
      surface: "canvas",
    }
  } catch {
    return errorOutcome({ scope, tool, intent: "rank_gauges", title })
  }
}
