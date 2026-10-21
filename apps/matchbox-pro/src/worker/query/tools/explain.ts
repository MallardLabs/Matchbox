import { z } from "zod"
import type { WireGaugeEpochs } from "../../../features/history/schema"
import type {
  Evidence,
  Fact,
  GaugeExplainBlock,
  VoteBranch,
} from "../../../features/query/contract"
import { decimalToScaledBigInt } from "../../../lib/money"
import calculateOptimalVeMEZO from "../../../lib/optimalVeMEZO"
import { calculateAnnualizedReturnBasisPoints } from "../../../lib/rewardOptimizer"
import {
  clipName,
  displayBlock,
  displayBps,
  displayToken,
  displayUsd,
  tokenAmount,
  usd6,
} from "../format"
import {
  type ModelRow,
  type ToolOutcome,
  makeEvidence,
  makeFact,
  traceItem,
} from "../outcome"
import type { BoostState } from "../providers/boost"
import { priceMicroUsd } from "../providers/prices"
import { assetFor } from "../providers/voting"
import { OPTIMIZER_CALC_VERSION, epochNumberFor } from "../versions"
import { type PricedTarget, priceTarget } from "../voteMath"
import {
  ZERO_WALLET,
  calcEvidence,
  domainEvidence,
  errorOutcome,
  plainOutcome,
  priceEvidence,
  queryFollowup,
  sourceCluster,
} from "./common"
import { type ToolContext, defineTool } from "./tool"
import { matchTarget, planVotes } from "./votes"

const WAD = 10n ** 18n
const MAX_BOOST_WAD = 5n * WAD
const MAX_APY_BPS = 1_000_000n
const BRANCHES: VoteBranch[] = ["boost", "validators", "pools"]

/** 1e18 = 1× → "4.20×". */
export function displayBoost(wad: bigint): string {
  const hundredths = (wad * 100n) / WAD
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}×`
}

function boostBps(wad: bigint): number {
  return Number((wad * 10_000n) / WAD)
}

function historyMicro(value: string | null): bigint | null {
  return value === null ? null : decimalToScaledBigInt(value, 6)
}

function historyApy(value: string | null): number | null {
  if (value === null) return null
  const bps = BigInt(value)
  return bps > MAX_APY_BPS ? null : Number(bps)
}

type Located = {
  branch: VoteBranch
  priced: Map<string, PricedTarget>
  entry: PricedTarget
}

type Location =
  | { kind: "found"; located: Located }
  | { kind: "ambiguous"; options: PricedTarget[] }
  | { kind: "none" }

async function locate(context: ToolContext, text: string): Promise<Location> {
  const prices = await context.providers.prices()
  for (const branch of BRANCHES) {
    const domain = await context.providers.votingDomain(branch)
    const priced = new Map(
      domain.targets.map((target) => [
        target.targetAddress.toLowerCase(),
        priceTarget(target, prices, 0n),
      ]),
    )
    const found = matchTarget(text, priced, { includeDead: true })
    const chosen =
      found.kind === "ambiguous" &&
      context.choice !== null &&
      found.options.some(
        (option) =>
          option.target.targetAddress.toLowerCase() === context.choice,
      )
        ? context.choice
        : null
    const address = chosen ?? (found.kind === "match" ? found.address : null)
    const entry = address ? priced.get(address) : undefined
    if (entry) return { kind: "found", located: { branch, priced, entry } }
    if (found.kind === "ambiguous")
      return { kind: "ambiguous", options: found.options }
  }
  return { kind: "none" }
}

type NotSelected = GaugeExplainBlock["notSelectedReason"]

async function selectionReason(
  context: ToolContext,
  located: Located,
): Promise<{ reason: NotSelected; bps: bigint | null }> {
  const { entry, branch } = located
  if (!entry.target.isAlive) return { reason: "not_alive", bps: null }
  if (entry.target.incentives.every((incentive) => incentive.amount <= 0n)) {
    return { reason: "no_incentives", bps: null }
  }
  if (entry.pricingStatus === "unpriced")
    return { reason: "unpriced", bps: null }
  if (context.wallet.address === ZERO_WALLET) {
    return { reason: "no_eligible_locks", bps: null }
  }
  const plan = await planVotes(context, { branch, lockIds: null, manual: null })
  if (!plan || plan.eligible.length === 0) {
    return { reason: "no_eligible_locks", bps: null }
  }
  const bps = plan.bps.get(entry.target.targetAddress.toLowerCase()) ?? null
  return bps !== null && bps > 0n
    ? { reason: "selected", bps }
    : { reason: "below_cutoff", bps: null }
}

export const explainGaugeTool = defineTool({
  name: "explain_gauge",
  family: "votes",
  description:
    "Explain one gauge, validator or pool: this epoch's incentives, current votes, APY, boost and optimal veMEZO, recent epochs, and why it is or isn't in the wallet's optimal ballot. Use for 'why is X APY down', 'tell me about the X gauge', 'why isn't X in my ballot'.",
  input: z.object({
    gauge: z
      .string()
      .min(1)
      .max(80)
      .describe("Name, address or #veBTC token id."),
    question: z.enum(["overview", "apy_change", "not_selected"]).nullable(),
    window: z.union([z.literal(4), z.literal(8), z.literal(12)]).nullable(),
  }),
  async run(context, input) {
    const tool = "explain_gauge"
    const { scope } = context
    const question = input.question ?? "overview"
    const window = input.window ?? 8
    try {
      const location = await locate(context, input.gauge)
      if (location.kind === "ambiguous") {
        return {
          ...plainOutcome({
            scope,
            tool,
            intent: "clarify",
            status: "clarify",
            title: "Which one?",
            templateId: `${tool}.disambiguate.v1`,
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
              options: location.options.map((option) => ({
                id: option.target.targetAddress.toLowerCase(),
                label: clipName(option.target.name, 60),
                detail: option.target.targetAddress,
                availability: "available" as const,
              })),
            },
          ],
        }
      }
      if (location.kind === "none") {
        return plainOutcome({
          scope,
          tool,
          intent: "explain_gauge",
          status: "unavailable",
          title: "Gauge",
          templateId: `${tool}.unknown.v1`,
          text: "No gauge, validator or pool matches that name.",
          kind: "unavailable",
          traceLabel: "Resolved targets",
        })
      }
      const { located } = location
      const { entry, branch } = located
      const target = entry.target
      const asset = assetFor(branch)
      const [domain, prices] = await Promise.all([
        context.providers.votingDomain(branch),
        context.providers.prices(),
      ])
      const tokenId = target.tokenId === null ? null : BigInt(target.tokenId)
      const [boost, history, selection] = await Promise.all([
        branch === "boost"
          ? context.providers.boostState(tokenId).catch(() => null)
          : Promise.resolve<BoostState | null>(null),
        branch === "boost"
          ? context.providers
              .gaugeHistory(target.gaugeAddress, window + 1, tokenId)
              .catch(() => null)
          : Promise.resolve<WireGaugeEpochs | null>(null),
        question === "not_selected"
          ? selectionReason(context, located)
          : Promise.resolve(null),
      ])

      const incentivesMicro =
        entry.pricingStatus === "unpriced" ? null : entry.incentiveMicroUsd
      const assetPrice = priceMicroUsd(
        branch === "boost" ? prices.mezo.priceUsd : prices.btc.priceUsd,
      )
      const apyRaw =
        incentivesMicro !== null && assetPrice !== null && target.weight > 0n
          ? calculateAnnualizedReturnBasisPoints({
              epochRewardMicroUsd: incentivesMicro,
              votingPowers: [target.weight],
              assetPriceMicroUsd: assetPrice,
            })
          : null
      const apy =
        apyRaw !== null && apyRaw <= MAX_APY_BPS ? Number(apyRaw) : null
      const optimal =
        boost && boost.unboostedVotingPower !== null
          ? calculateOptimalVeMEZO(
              boost.unboostedVotingPower,
              target.weight,
              boost.veBtcUnboostedTotal,
              boost.veMezoTotal,
            )
          : undefined
      const weightAmount = tokenAmount(target.weight, 18, asset)
      const rows = history?.rows ?? []
      const sealed = rows
        .filter((row) => row.status === "sealed")
        .slice(0, window)
      const funded = sealed.filter((row) =>
        row.incentives.some((line) => BigInt(line.amount) > 0n),
      ).length

      const evidence: Evidence[] = [
        domainEvidence(scope, domain),
        priceEvidence(scope, prices, branch === "boost" ? "mezo" : "both"),
        calcEvidence(
          scope,
          OPTIMIZER_CALC_VERSION,
          "APY extrapolated from this epoch",
          domain.fetchedAt,
        ),
      ]
      if (history) {
        evidence.push(
          makeEvidence({
            scope,
            key: "history",
            kind: "chain",
            label: "Recent epochs · bribe checkpoints",
            source: "Bribe supply + tokenRewardsPerEpoch",
            fetchedAt: context.now().toISOString(),
            status: "historical",
          }),
        )
      }
      const refs = evidence.map((item) => item.id)
      const [domainRef, priceRef, calcRef] = refs
      const name = clipName(target.name, 32)
      const facts: Fact[] = []
      const add = (fact: Fact): Fact => {
        facts.push(fact)
        return fact
      }
      const nameFact = add(
        makeFact({
          scope,
          key: "name",
          label: "Target",
          value: { kind: "text", text: name },
          display: name,
          status: "live",
          evidenceRefs: [domainRef ?? ""],
        }),
      )
      const incentivesFact = add(
        makeFact({
          scope,
          key: "incentives",
          label: "Incentives this epoch",
          value:
            incentivesMicro === null
              ? { kind: "text", text: "Unpriced" }
              : { kind: "usd", usd: usd6(incentivesMicro) },
          display: displayUsd(incentivesMicro),
          status:
            incentivesMicro === null
              ? "unpriced"
              : entry.pricingStatus === "complete"
                ? "live"
                : "estimated",
          evidenceRefs: [domainRef ?? "", priceRef ?? ""],
        }),
      )
      const weightFact = add(
        makeFact({
          scope,
          key: "weight",
          label: "Current votes",
          value: { kind: "token", amount: weightAmount },
          display: displayToken(weightAmount),
          status: "live",
          evidenceRefs: [domainRef ?? ""],
        }),
      )
      const apyFact =
        apy === null
          ? null
          : add(
              makeFact({
                scope,
                key: "apy",
                label: "APY (extrapolated)",
                value: { kind: "bps", bps: apy },
                display: displayBps(apy),
                status: "estimated",
                evidenceRefs: [calcRef ?? "", priceRef ?? ""],
              }),
            )
      const boostFact =
        boost?.boostWad != null
          ? add(
              makeFact({
                scope,
                key: "boost",
                label: "Boost",
                value: { kind: "bps", bps: boostBps(boost.boostWad) },
                display: displayBoost(boost.boostWad),
                status: "live",
                evidenceRefs: [domainRef ?? ""],
              }),
            )
          : null
      const additionalFact =
        optimal && optimal.optimalAdditionalVeMEZO > 0n
          ? add(
              makeFact({
                scope,
                key: "additional",
                label: "veMEZO to max boost",
                value: {
                  kind: "token",
                  amount: tokenAmount(
                    optimal.optimalAdditionalVeMEZO,
                    18,
                    "veMEZO",
                  ),
                },
                display: displayToken(
                  tokenAmount(optimal.optimalAdditionalVeMEZO, 18, "veMEZO"),
                ),
                status: "estimated",
                evidenceRefs: [domainRef ?? "", calcRef ?? ""],
              }),
            )
          : null
      const fundedFact =
        history && sealed.length > 0
          ? add(
              makeFact({
                scope,
                key: "funded",
                label: "Funded epochs",
                value: { kind: "count", count: funded },
                display: `${funded} of the last ${sealed.length}`,
                status: "historical",
                evidenceRefs: refs.slice(-1),
              }),
            )
          : null

      let templateId = `${tool}.overview.v1`
      let text = `${nameFact.display}: ${incentivesFact.display} incentives this epoch, APY ${apyFact?.display ?? "unpriced"} at ${weightFact.display}.`
      if (boostFact && branch === "boost") {
        text += additionalFact
          ? ` Boost ${boostFact.display}; ${additionalFact.display} more reaches max boost.`
          : (boost?.boostWad ?? 0n) >= MAX_BOOST_WAD
            ? ` Boost ${boostFact.display}, the maximum.`
            : ` Boost ${boostFact.display}.`
      }
      if (question === "apy_change") {
        const current = rows.find((row) => row.status === "current")
        const previous = sealed[0]
        const currentApy = current ? historyApy(current.apyBps) : null
        const previousApy = previous ? historyApy(previous.apyBps) : null
        if (
          current &&
          previous &&
          currentApy !== null &&
          previousApy !== null
        ) {
          const nowApy = add(
            makeFact({
              scope,
              key: "apy_now",
              label: "APY now",
              value: { kind: "bps", bps: currentApy },
              display: displayBps(currentApy),
              status: "estimated",
              evidenceRefs: refs,
            }),
          )
          const prevApy = add(
            makeFact({
              scope,
              key: "apy_prev",
              label: "APY last epoch",
              value: { kind: "bps", bps: previousApy },
              display: displayBps(previousApy),
              status: "historical",
              evidenceRefs: refs,
            }),
          )
          const nowInc = historyMicro(current.incentivesUsd)
          const prevInc = historyMicro(previous.incentivesUsd)
          const nowIncFact = add(
            makeFact({
              scope,
              key: "inc_now",
              label: "Incentives now",
              value:
                nowInc === null
                  ? { kind: "text", text: "Unpriced" }
                  : { kind: "usd", usd: usd6(nowInc) },
              display: displayUsd(nowInc),
              status: "live",
              evidenceRefs: refs,
            }),
          )
          const prevIncFact = add(
            makeFact({
              scope,
              key: "inc_prev",
              label: "Incentives last epoch",
              value:
                prevInc === null
                  ? { kind: "text", text: "Unpriced" }
                  : { kind: "usd", usd: usd6(prevInc) },
              display: displayUsd(prevInc),
              status: "historical",
              evidenceRefs: refs,
            }),
          )
          const nowWeight = tokenAmount(BigInt(current.veMezo), 18, "veMEZO")
          const prevWeight = tokenAmount(BigInt(previous.veMezo), 18, "veMEZO")
          const nowWeightFact = add(
            makeFact({
              scope,
              key: "votes_now",
              label: "Votes now",
              value: { kind: "token", amount: nowWeight },
              display: displayToken(nowWeight, 0),
              status: "live",
              evidenceRefs: refs,
            }),
          )
          const prevWeightFact = add(
            makeFact({
              scope,
              key: "votes_prev",
              label: "Votes last epoch",
              value: { kind: "token", amount: prevWeight },
              display: displayToken(prevWeight, 0),
              status: "historical",
              evidenceRefs: refs,
            }),
          )
          templateId = `${tool}.apy_change.v1`
          text = `${nameFact.display} APY went from ${prevApy.display} to ${nowApy.display}: incentives ${prevIncFact.display} → ${nowIncFact.display}, votes ${prevWeightFact.display} → ${nowWeightFact.display}.`
        } else {
          templateId = `${tool}.apy_change_unavailable.v1`
          text = `${text} No sealed epoch to compare against yet.`
        }
      }
      if (question === "not_selected" && selection) {
        templateId = `${tool}.not_selected.${selection.reason}.v1`
        if (selection.reason === "selected" && selection.bps !== null) {
          const alloc = add(
            makeFact({
              scope,
              key: "alloc",
              label: "Optimal allocation",
              value: { kind: "bps", bps: Number(selection.bps) },
              display: displayBps(Number(selection.bps)),
              status: "projected",
              evidenceRefs: [calcRef ?? ""],
            }),
          )
          text = `${nameFact.display} is in your optimal ballot at ${alloc.display}.`
        } else if (selection.reason === "not_alive") {
          text = `${nameFact.display} is not alive, so it can't receive votes.`
        } else if (selection.reason === "no_incentives") {
          text = `${nameFact.display} has no incentives this epoch.`
        } else if (selection.reason === "unpriced") {
          text = `${nameFact.display}'s incentives are unpriced, so the optimizer leaves it out.`
        } else if (selection.reason === "no_eligible_locks") {
          text = `No eligible ${asset} lock to optimize for this wallet.`
        } else {
          text = `${nameFact.display} pays less per vote than the selected targets at current votes (${incentivesFact.display} on ${weightFact.display}).`
        }
      }

      const block: GaugeExplainBlock = {
        type: "gauge_explain",
        version: 1,
        id: scope.id("b.explain"),
        evidenceRefs: refs,
        target: {
          targetAddress: target.targetAddress,
          name: target.name.slice(0, 80),
          nameSource: target.nameSource,
          tokenId: target.tokenId,
          branch,
          isAlive: target.isAlive,
        },
        incentivesUsd: incentivesMicro === null ? null : usd6(incentivesMicro),
        pricingStatus: entry.pricingStatus,
        incentives: target.incentives
          .filter((incentive) => incentive.amount > 0n)
          .slice(0, 16)
          .map((incentive) =>
            tokenAmount(incentive.amount, incentive.decimals, incentive.symbol),
          ),
        weight: weightAmount,
        apyBps: apy,
        boostWad: boost?.boostWad != null ? boost.boostWad.toString() : null,
        optimalVeMEZO: optimal
          ? tokenAmount(optimal.optimalVeMEZO, 18, "veMEZO")
          : null,
        additionalVeMEZO: optimal
          ? tokenAmount(optimal.optimalAdditionalVeMEZO, 18, "veMEZO")
          : null,
        epochs: rows.slice(0, 12).map((row) => {
          const micro = historyMicro(row.incentivesUsd)
          return {
            epochStart: row.epochStart,
            status: row.status,
            incentivesUsd: micro === null ? null : usd6(micro),
            apyBps: historyApy(row.apyBps),
            weight: tokenAmount(BigInt(row.veMezo), 18, "veMEZO"),
            boostWad: row.boostWad,
          }
        }),
        historyStatus: history ? "live" : "unavailable",
        notSelectedReason: selection?.reason ?? null,
        snapshotBlock: domain.blockNumber.toString(),
      }
      const modelRows: ModelRow[] = [
        {
          name: target.name,
          incentives: incentivesFact.display,
          apy: apyFact?.display ?? null,
          votes: weightFact.display,
          boost: boostFact?.display ?? null,
          toMaxBoost: additionalFact?.display ?? null,
          funded: fundedFact?.display ?? null,
          alive: target.isAlive ? "yes" : "no",
        },
        ...rows.slice(0, 12).map((row) => ({
          epoch: `${epochNumberFor(BigInt(row.epochStart)) ?? row.epochStart}`,
          incentives: displayUsd(historyMicro(row.incentivesUsd)),
          apy:
            historyApy(row.apyBps) === null
              ? null
              : displayBps(historyApy(row.apyBps) ?? 0),
          votes: displayToken(tokenAmount(BigInt(row.veMezo), 18, "veMEZO"), 0),
          boost:
            row.boostWad === null ? null : displayBoost(BigInt(row.boostWad)),
        })),
      ]
      return {
        tool,
        intent: "explain_gauge",
        status: "ok",
        title: clipName(target.name, 80),
        snapshot: {
          blockNumber: domain.blockNumber,
          epoch: epochNumberFor(domain.epochStart),
          label: `block ${displayBlock(domain.blockNumber)}`,
        },
        answer: {
          kind: "result",
          templateId,
          text: text.slice(0, 400),
          factRefs: facts.map((fact) => fact.id),
        },
        why: {
          templateId: `${tool}.why.v1`,
          items: [
            {
              text: "APY is extrapolated from this epoch's priced incentives at current votes. More votes on the same incentives lower it for every voter.",
              factRefs: [],
            },
          ],
        },
        facts,
        evidence,
        blocks: [block, sourceCluster(scope, evidence)],
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
            key: "explain",
            label: `Read ${clipName(target.name, 40)} at block ${displayBlock(domain.blockNumber)}`,
            detail: history ? `${rows.length} epochs` : null,
            tool,
          }),
        ],
        model: { rows: modelRows, notes: [] },
        surface: "canvas",
      } satisfies ToolOutcome
    } catch {
      return errorOutcome({
        scope,
        tool,
        intent: "explain_gauge",
        title: "Gauge",
      })
    }
  },
})
