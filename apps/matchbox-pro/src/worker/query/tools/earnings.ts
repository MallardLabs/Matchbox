import { z } from "zod"
import type { Evidence, Fact } from "../../../features/query/contract"
import { decimalToScaledBigInt } from "../../../lib/money"
import { calculateAnnualizedReturnBasisPoints } from "../../../lib/rewardOptimizer"
import {
  displayBps,
  displayToken,
  displayUsd,
  tokenAmount,
  usd6,
} from "../format"
import { type ToolOutcome, makeEvidence, makeFact, traceItem } from "../outcome"
import { priceMicroUsd } from "../providers/prices"
import { OPTIMIZER_CALC_VERSION, epochNumberFor } from "../versions"
import {
  ZERO_WALLET,
  calcEvidence,
  errorOutcome,
  navigateFollowup,
  plainOutcome,
  priceEvidence,
  queryFollowup,
  sourceCluster,
} from "./common"
import { defineTool } from "./tool"

// Above 10,000% an extrapolated APY says nothing useful; show none.
const MAX_APY_BPS = 1_000_000n

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

function historyMicro(value: string | null): bigint | null {
  return value === null ? null : decimalToScaledBigInt(value, 6)
}

/**
 * What the selected wallet earns from veMEZO voting incentives, from the
 * history worker's exact bribe-checkpoint math (the Overview's numbers).
 */
export const walletEarningsTool = defineTool({
  name: "get_wallet_earnings",
  family: "rewards",
  description:
    "The selected wallet's veMEZO voting-incentive earnings: projected this epoch from its standing votes, extrapolated APY on its veMEZO voting power, the last sealed epoch, and what is claimable. Use for 'what is my APY', 'what am I earning'.",
  input: z.object({}),
  async run(context) {
    const tool = "get_wallet_earnings"
    const { scope, wallet } = context
    if (wallet.address === ZERO_WALLET) {
      return plainOutcome({
        scope,
        tool,
        intent: "wallet_earnings",
        status: "empty",
        title: "My earnings",
        templateId: `${tool}.no_wallet.v1`,
        text: "Connect or watch a wallet to see what it earns.",
        kind: "empty",
        traceLabel: "No wallet selected",
      })
    }
    try {
      const [earnings, locks, prices] = await Promise.all([
        context.providers.walletEarnings(wallet.address),
        context.providers.walletLocks(wallet.address, "veMEZO"),
        context.providers.prices(),
      ])
      const power = locks.reduce((sum, lock) => sum + lock.votingPower, 0n)
      if (earnings.tokenIds.length === 0 && power === 0n) {
        return plainOutcome({
          scope,
          tool,
          intent: "wallet_earnings",
          status: "empty",
          title: "My earnings",
          templateId: `${tool}.no_locks.v1`,
          text: "No veMEZO lock earning voting incentives for this wallet.",
          kind: "empty",
          traceLabel: "Checked veMEZO locks",
          followups: [
            navigateFollowup(scope, "overview", "Open Overview", "/"),
          ],
        })
      }
      const fetchedAt = context.now().toISOString()
      const epochStart = BigInt(earnings.current.epochStart)
      const evidence: Evidence[] = [
        makeEvidence({
          scope,
          key: "earnings",
          kind: "chain",
          label: "Earnings · bribe checkpoints",
          source: "Bribe balance/supply checkpoints + earned()",
          ...(epochNumberFor(epochStart) !== null
            ? { epoch: epochNumberFor(epochStart) ?? 0 }
            : {}),
          fetchedAt,
          status: earnings.partial ? "stale" : "live",
        }),
        priceEvidence(scope, prices, "mezo"),
        calcEvidence(
          scope,
          OPTIMIZER_CALC_VERSION,
          "APY extrapolated from this epoch",
          fetchedAt,
        ),
      ]
      const [earnRef, priceRef, calcRef] = evidence.map((item) => item.id)
      const projected = historyMicro(earnings.current.usdNow)
      const claimable = historyMicro(earnings.totals.claimable.usdNow)
      const last = earnings.epochs.at(-1) ?? null
      const lastMicro = last ? historyMicro(last.usdAtEarn) : null
      const mezoPrice = priceMicroUsd(prices.mezo.priceUsd)
      const apyRaw =
        projected !== null && projected > 0n && power > 0n && mezoPrice !== null
          ? calculateAnnualizedReturnBasisPoints({
              epochRewardMicroUsd: projected,
              votingPowers: [power],
              assetPriceMicroUsd: mezoPrice,
            })
          : null
      const apy =
        apyRaw !== null && apyRaw <= MAX_APY_BPS ? Number(apyRaw) : null
      const powerAmount = tokenAmount(power, 18, "veMEZO")
      const status = earnings.partial ? "estimated" : "projected"

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
          value:
            projected === null
              ? { kind: "text", text: "Unpriced" }
              : { kind: "usd", usd: usd6(projected) },
          display: displayUsd(projected),
          status: projected === null ? "unpriced" : status,
          evidenceRefs: [earnRef ?? "", priceRef ?? ""],
        }),
      )
      const powerFact = add(
        makeFact({
          scope,
          key: "power",
          label: "veMEZO voting power",
          value: { kind: "token", amount: powerAmount },
          display: displayToken(powerAmount),
          status: "live",
          evidenceRefs: [earnRef ?? ""],
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
      const claimableFact = add(
        makeFact({
          scope,
          key: "claimable",
          label: "Claimable",
          value:
            claimable === null
              ? { kind: "text", text: "Unpriced" }
              : { kind: "usd", usd: usd6(claimable) },
          display: displayUsd(claimable),
          status: claimable === null ? "unpriced" : "live",
          evidenceRefs: [earnRef ?? "", priceRef ?? ""],
        }),
      )
      const lastFact =
        lastMicro === null
          ? null
          : add(
              makeFact({
                scope,
                key: "last",
                label: "Last epoch",
                value: { kind: "usd", usd: usd6(lastMicro) },
                display: displayUsd(lastMicro),
                status: "historical",
                evidenceRefs: [earnRef ?? ""],
              }),
            )

      // A priced zero reads as words, not "$0.00".
      const claimableText =
        claimable === 0n
          ? "nothing claimable"
          : `${claimableFact.display} claimable`
      let text: string
      if (projected === null) {
        text = `This epoch's projection is unpriced on ${powerFact.display}. ${capitalize(claimableText)}.`
      } else if (projected === 0n) {
        text = `No standing votes earning this epoch on ${powerFact.display}. ${capitalize(claimableText)}.`
      } else {
        text = `Earning ${projectedFact.display} this epoch on ${powerFact.display}${
          apyFact ? `, APY ${apyFact.display}` : ""
        }.${
          lastFact
            ? ` Last epoch ${lastFact.display}; ${claimableText}.`
            : ` ${capitalize(claimableText)}.`
        }`
      }
      const refs = evidence.map((item) => item.id)
      return {
        tool,
        intent: "wallet_earnings",
        status: "ok",
        title: "My earnings",
        snapshot: {
          blockNumber: null,
          epoch: epochNumberFor(epochStart),
          label:
            epochNumberFor(epochStart) === null
              ? "Live"
              : `epoch ${epochNumberFor(epochStart)}`,
        },
        answer: {
          kind: "result",
          templateId: `${tool}.lead.v1`,
          text,
          factRefs: facts.map((fact) => fact.id),
        },
        why: {
          templateId: `${tool}.why.v1`,
          items: [
            {
              text: earnings.partial
                ? "Some prices are still loading, so USD figures are lower bounds."
                : "Projected from the wallet's standing votes on this epoch's deposits. APY extrapolates this epoch over a year on current veMEZO voting power.",
              factRefs: [],
            },
          ],
        },
        facts,
        evidence,
        blocks: [
          {
            type: "metric_summary",
            version: 1,
            id: scope.id("b.summary"),
            evidenceRefs: refs,
            label: "Projected this epoch",
            primaryUsd: projected === null ? null : usd6(projected),
            primaryStatus: projected === null ? "unpriced" : status,
            secondary: null,
            apyBps: apy,
            apyStatus: apy === null ? null : "extrapolated",
            objectiveNote: null,
            snapshotBlock: null,
          },
          sourceCluster(scope, evidence),
        ],
        proposals: [],
        followups: [
          queryFollowup(
            scope,
            "optimize",
            "Optimize my votes",
            "optimize my votes",
          ),
          queryFollowup(scope, "claim", "Claim all", "claim all my rewards"),
        ],
        trace: [
          traceItem({
            scope,
            key: "earnings",
            label: `Read earnings for ${earnings.tokenIds.length} veMEZO locks`,
            tool,
          }),
        ],
        model: {
          rows: [
            {
              projected: projectedFact.display,
              apy: apyFact?.display ?? null,
              power: powerFact.display,
              lastEpoch: lastFact?.display ?? null,
              claimable: claimableFact.display,
            },
          ],
          notes: earnings.partial ? ["USD figures are lower bounds."] : [],
        },
        surface: "rail",
      } satisfies ToolOutcome
    } catch {
      return errorOutcome({
        scope,
        tool,
        intent: "wallet_earnings",
        title: "My earnings",
      })
    }
  },
})
