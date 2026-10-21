import { encodeFunctionData } from "viem"
import { z } from "zod"
import type {
  Evidence,
  Fact,
  LiquidationScenarioBlock,
  LoanPositionBlock,
  Proposal,
  UiBlock,
} from "../../../features/query/contract"
import { decimalToScaledBigInt } from "../../../lib/money"
import {
  displayBlock,
  displayBps,
  displayRatioBps,
  displayToken,
  displayUsd,
  microFromUsd6,
  shortAddress,
  tokenAmount,
  usd6,
} from "../format"
import {
  bandFor,
  collateralRatio,
  dropToLiquidationBps,
  liquidationPrice,
  liquidationShockBps,
  maxPartialRepay,
  ratioToBps,
  repaySplit,
  scenarioPoint,
  wadToMicro,
  wadToMicroCeilCent,
} from "../loanMath"
import {
  type IdScope,
  type ModelRow,
  type ToolOutcome,
  makeEvidence,
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
import {
  BORROWER_OPERATIONS_ABI,
  MAINNET,
  ZERO_ADDRESS,
} from "../providers/abis"
import type { TroveSnapshot } from "../providers/loans"
import { LOAN_CALC_VERSION } from "../versions"
import {
  ZERO_WALLET,
  calcEvidence,
  errorOutcome,
  plainOutcome,
  queryFollowup,
  sourceCluster,
} from "./common"
import { type ToolContext, defineTool } from "./tool"

const BTC = (raw: bigint) => tokenAmount(raw, 18, "BTC")
const MUSD = (raw: bigint) => tokenAmount(raw, 18, "mUSD")

function troveEvidence(scope: IdScope, trove: TroveSnapshot): Evidence[] {
  return [
    makeEvidence({
      scope,
      key: "trove",
      kind: "chain",
      label: "Trove · live",
      source: `TroveManager ${shortAddress(MAINNET.troveManager)}`,
      blockNumber: trove.blockNumber.toString(),
      fetchedAt: trove.fetchedAt,
      status: "live",
    }),
    makeEvidence({
      scope,
      key: "price",
      kind: "price",
      label:
        trove.price === null ? "BTC price · stale" : "BTC price · PriceFeed",
      source: "Mezo PriceFeed (Skip oracle)",
      blockNumber: trove.blockNumber.toString(),
      fetchedAt: trove.fetchedAt,
      status: trove.price === null ? "stale" : "live",
    }),
    calcEvidence(
      scope,
      LOAN_CALC_VERSION,
      "LiquityMath CR / liquidation price",
      trove.fetchedAt,
    ),
  ]
}

export type TroveFigures = {
  debt: bigint
  ratio: bigint | null
  ratioBps: number | null
  liqPrice: bigint | null
  liqMicro: bigint | null
  priceMicro: bigint | null
  collateralMicro: bigint | null
  dropBps: number | null
  maxRepay: bigint
  health: LoanPositionBlock["health"]
}

export function troveFigures(trove: TroveSnapshot): TroveFigures {
  const debt = trove.principal + trove.interest
  const ratio =
    trove.price === null ? null : collateralRatio(trove.coll, trove.price, debt)
  const liqPrice = liquidationPrice(trove.mcr, debt, trove.coll)
  const band = bandFor(ratio, trove.mcr, trove.ccr)
  return {
    debt,
    ratio,
    ratioBps: ratio === null ? null : ratioToBps(ratio),
    liqPrice,
    liqMicro: liqPrice === null ? null : wadToMicroCeilCent(liqPrice),
    priceMicro: trove.price === null ? null : wadToMicro(trove.price),
    collateralMicro:
      trove.price === null
        ? null
        : wadToMicro((trove.coll * trove.price) / 10n ** 18n),
    dropBps:
      trove.price === null || liqPrice === null
        ? null
        : dropToLiquidationBps(trove.price, liqPrice),
    maxRepay: maxPartialRepay(debt, trove.gasCompensation, trove.minNetDebt),
    health:
      trove.status !== "active"
        ? "inactive"
        : trove.price === null
          ? "unpriced"
          : band === "liquidatable"
            ? "liquidatable"
            : band === "near_liquidation"
              ? "near_liquidation"
              : "healthy",
  }
}

export function loanPositionBlock(
  scope: IdScope,
  trove: TroveSnapshot,
  figures: TroveFigures,
  evidenceRefs: string[],
): LoanPositionBlock {
  const actions: LoanPositionBlock["actions"] = []
  if (trove.status === "active")
    actions.push("review_repayment", "run_scenario")
  if (trove.surplusCollateral > 0n) actions.push("claim_collateral_surplus")
  return {
    type: "loan_position",
    version: 1,
    id: scope.id("b.loan"),
    evidenceRefs,
    troveOwner: trove.owner,
    status: trove.status,
    collateral: BTC(trove.coll),
    collateralUsd:
      figures.collateralMicro === null ? null : usd6(figures.collateralMicro),
    collateralPriceUsd:
      figures.priceMicro === null ? null : usd6(figures.priceMicro),
    priceStatus: trove.price === null ? "stale" : "live",
    principal: MUSD(trove.principal),
    interest: MUSD(trove.interest),
    debt: MUSD(figures.debt),
    interestRateBps: trove.interestRateBps,
    collateralRatioBps: figures.ratioBps,
    minCollateralRatioBps: ratioToBps(trove.mcr),
    criticalCollateralRatioBps: ratioToBps(trove.ccr),
    totalCollateralRatioBps: trove.tcr === null ? null : ratioToBps(trove.tcr),
    recoveryMode: trove.recoveryMode,
    health: figures.health,
    liquidationPriceUsd:
      figures.liqMicro === null ? null : usd6(figures.liqMicro),
    dropToLiquidationBps: figures.dropBps,
    gasCompensation: MUSD(trove.gasCompensation),
    maxPartialRepay: trove.status === "active" ? MUSD(figures.maxRepay) : null,
    musdBalance: MUSD(trove.musdBalance),
    surplusCollateral:
      trove.surplusCollateral > 0n ? BTC(trove.surplusCollateral) : null,
    snapshotBlock: trove.blockNumber.toString(),
    history: [],
    historyStatus: "unavailable",
    actions,
  }
}

function troveModelRow(trove: TroveSnapshot, figures: TroveFigures): ModelRow {
  return {
    status: trove.status,
    collateral: displayToken(BTC(trove.coll), 4),
    collateralUsd: displayUsd(figures.collateralMicro),
    btcPrice: displayUsd(figures.priceMicro),
    debt: displayToken(MUSD(figures.debt)),
    interest: displayToken(MUSD(trove.interest)),
    rate:
      trove.interestRateBps === null ? null : displayBps(trove.interestRateBps),
    ratio: figures.ratioBps === null ? null : displayRatioBps(figures.ratioBps),
    minRatio: displayRatioBps(ratioToBps(trove.mcr)),
    liquidationPrice: displayUsd(figures.liqMicro),
    dropToLiquidation:
      figures.dropBps === null ? null : displayBps(figures.dropBps),
    maxRepay: displayToken(MUSD(figures.maxRepay)),
    musdBalance: displayToken(MUSD(trove.musdBalance)),
    surplus:
      trove.surplusCollateral > 0n
        ? displayToken(BTC(trove.surplusCollateral), 4)
        : null,
    block: displayBlock(trove.blockNumber),
  }
}

function noTrove(
  context: ToolContext,
  tool: string,
  intent: ToolOutcome["intent"],
): ToolOutcome {
  return plainOutcome({
    scope: context.scope,
    tool,
    intent,
    status: "empty",
    title: "mUSD trove",
    templateId: `${tool}.no_wallet.v1`,
    text: "Connect or watch a wallet to read its mUSD trove.",
    kind: "empty",
    traceLabel: "No wallet selected",
  })
}

/** Facts and answer for an inactive trove (none, closed, surplus). */
function inactiveOutcome(
  context: ToolContext,
  tool: string,
  intent: ToolOutcome["intent"],
  trove: TroveSnapshot,
  figures: TroveFigures,
): ToolOutcome {
  const { scope } = context
  const evidence = troveEvidence(scope, trove)
  const refs = evidence.map((item) => item.id)
  const facts: Fact[] = []
  let text = "No mUSD trove for this wallet."
  if (trove.status !== "none") {
    const statusText =
      trove.status === "closed_by_redemption"
        ? "closed by redemption"
        : trove.status === "closed_by_liquidation"
          ? "closed by liquidation"
          : "closed"
    text = `This trove is ${statusText}.`
  }
  if (trove.surplusCollateral > 0n) {
    const surplus = makeFact({
      scope,
      key: "surplus",
      label: "Claimable collateral surplus",
      value: { kind: "token", amount: BTC(trove.surplusCollateral) },
      display: displayToken(BTC(trove.surplusCollateral), 4),
      status: "live",
      evidenceRefs: [refs[0] ?? ""],
    })
    facts.push(surplus)
    text = `${text} ${surplus.display} collateral surplus is claimable.`
  }
  return {
    tool,
    intent,
    status: "empty",
    title: "mUSD trove",
    snapshot: {
      blockNumber: trove.blockNumber,
      epoch: null,
      label: `block ${displayBlock(trove.blockNumber)}`,
    },
    answer: {
      kind: trove.surplusCollateral > 0n ? "result" : "empty",
      templateId: `${tool}.inactive.v1`,
      text,
      factRefs: facts.map((fact) => fact.id),
    },
    why: null,
    facts,
    evidence,
    blocks: [
      loanPositionBlock(scope, trove, figures, refs),
      sourceCluster(scope, evidence),
    ],
    proposals: [],
    followups:
      trove.surplusCollateral > 0n
        ? [
            queryFollowup(
              scope,
              "surplus",
              "Claim collateral surplus",
              "claim my collateral surplus",
            ),
          ]
        : [],
    trace: [
      traceItem({
        scope,
        key: "trove",
        label: `Read trove at block ${displayBlock(trove.blockNumber)}`,
        tool,
      }),
    ],
    model: { rows: [troveModelRow(trove, figures)], notes: [] },
    surface: "rail",
  }
}

async function readTrove(context: ToolContext): Promise<TroveSnapshot> {
  return context.providers.trove(context.wallet.address)
}

export const getLoanPositionTool = defineTool({
  name: "get_loan_position",
  family: "loans",
  description:
    "The selected wallet's mUSD trove: collateral (BTC), debt (principal + accrued interest), collateral ratio vs the 110% minimum, liquidation price, recovery mode, and any claimable collateral surplus.",
  input: z.object({}),
  async run(context) {
    const tool = "get_loan_position"
    if (context.wallet.address === ZERO_WALLET)
      return noTrove(context, tool, "loan_position")
    try {
      const trove = await readTrove(context)
      const figures = troveFigures(trove)
      if (trove.status !== "active") {
        return inactiveOutcome(context, tool, "loan_position", trove, figures)
      }
      const { scope } = context
      const evidence = troveEvidence(scope, trove)
      const refs = evidence.map((item) => item.id)
      const [troveRef, priceRef, calcRef] = refs
      const facts: Fact[] = [
        makeFact({
          scope,
          key: "debt",
          label: "Debt",
          value: { kind: "token", amount: MUSD(figures.debt) },
          display: displayToken(MUSD(figures.debt)),
          status: "live",
          evidenceRefs: [troveRef ?? ""],
        }),
        makeFact({
          scope,
          key: "mcr",
          label: "Minimum collateral ratio",
          value: { kind: "bps", bps: ratioToBps(trove.mcr) },
          display: displayRatioBps(ratioToBps(trove.mcr)),
          status: "live",
          evidenceRefs: [troveRef ?? ""],
        }),
      ]
      let text: string
      if (figures.ratioBps === null || figures.liqMicro === null) {
        text = `Debt ${facts[0]?.display}. BTC price is stale, so the collateral ratio is unpriced.`
      } else {
        const ratio = makeFact({
          scope,
          key: "ratio",
          label: "Collateral ratio",
          value: { kind: "bps", bps: figures.ratioBps },
          display: displayRatioBps(figures.ratioBps),
          status: "live",
          evidenceRefs: [troveRef ?? "", priceRef ?? "", calcRef ?? ""],
        })
        const liq = makeFact({
          scope,
          key: "liq",
          label: "Liquidation price",
          value: { kind: "usd", usd: usd6(figures.liqMicro) },
          display: displayUsd(figures.liqMicro),
          status: "exact",
          evidenceRefs: [troveRef ?? "", calcRef ?? ""],
        })
        facts.push(ratio, liq)
        const healthText =
          figures.health === "healthy"
            ? "Healthy"
            : figures.health === "near_liquidation"
              ? "Near liquidation"
              : "Liquidatable"
        text = `${healthText} at ${ratio.display} collateral ratio (min ${facts[1]?.display}). Liquidation below ${liq.display} per BTC.`
      }
      return {
        tool,
        intent: "loan_position",
        status: "ok",
        title: "How healthy is my mUSD trove?",
        snapshot: {
          blockNumber: trove.blockNumber,
          epoch: null,
          label: `block ${displayBlock(trove.blockNumber)}`,
        },
        answer: {
          kind: "result",
          templateId: "get_loan_position.lead.v1",
          text,
          factRefs: facts.map((fact) => fact.id),
        },
        why: {
          templateId: "get_loan_position.why.v1",
          items: [
            {
              text: "Protocol state from TroveManager and the Mezo PriceFeed, not a portfolio P&L. Debt includes accrued simple interest.",
              factRefs: [],
            },
          ],
        },
        facts,
        evidence,
        blocks: [
          loanPositionBlock(scope, trove, figures, refs),
          sourceCluster(scope, evidence),
        ],
        proposals: [],
        followups: [
          queryFollowup(
            scope,
            "scenario",
            "Run price scenario",
            "if BTC falls 35%, do I get liquidated?",
          ),
          queryFollowup(
            scope,
            "repay",
            "Review repayment",
            "repay max mUSD on my trove",
          ),
        ],
        trace: [
          traceItem({
            scope,
            key: "trove",
            label: `Read trove and PriceFeed at block ${displayBlock(trove.blockNumber)}`,
            tool,
          }),
        ],
        model: { rows: [troveModelRow(trove, figures)], notes: [] },
        surface: "canvas",
      }
    } catch {
      return errorOutcome({
        scope: context.scope,
        tool,
        intent: "loan_position",
        title: "mUSD trove",
      })
    }
  },
})

const DEFAULT_SHOCKS = [10, 25, 50]

export const scenarioLiquidationTool = defineTool({
  name: "scenario_liquidation",
  family: "loans",
  description:
    "Deterministic BTC price-drop table for the selected wallet's trove on the current snapshot (not a forecast). Use for 'if BTC falls N%, do I get liquidated?'.",
  input: z.object({
    drops: z
      .array(z.number().int().min(1).max(99))
      .max(6)
      .nullable()
      .describe("Percent BTC price drops to model; null = 10/25/50."),
    requested: z
      .number()
      .int()
      .min(1)
      .max(99)
      .nullable()
      .describe("The drop the user asked about, in percent."),
  }),
  async run(context, input) {
    const tool = "scenario_liquidation"
    if (context.wallet.address === ZERO_WALLET) {
      return noTrove(context, tool, "liquidation_scenario")
    }
    try {
      const trove = await readTrove(context)
      const figures = troveFigures(trove)
      if (trove.status !== "active") {
        return inactiveOutcome(
          context,
          tool,
          "liquidation_scenario",
          trove,
          figures,
        )
      }
      const { scope } = context
      if (
        trove.price === null ||
        figures.ratioBps === null ||
        figures.liqMicro === null
      ) {
        return plainOutcome({
          scope,
          tool,
          intent: "liquidation_scenario",
          status: "unavailable",
          title: "Liquidation scenario",
          templateId: `${tool}.stale.v1`,
          text: "BTC price feed is stale. No scenario until it updates.",
          kind: "unavailable",
          traceLabel: "Read PriceFeed",
          evidence: troveEvidence(scope, trove),
        })
      }
      const price = trove.price
      const evidence = troveEvidence(scope, trove)
      const refs = evidence.map((item) => item.id)
      const liqShock = liquidationShockBps({
        coll: trove.coll,
        debt: figures.debt,
        price,
        mcr: trove.mcr,
      })
      const requestedBps =
        input.requested === null ? null : -input.requested * 100
      const shocks = new Set<number>(
        (input.drops ?? DEFAULT_SHOCKS).map((drop) => -drop * 100),
      )
      if (requestedBps !== null) shocks.add(requestedBps)
      if (liqShock !== null) shocks.add(liqShock)
      const rows = [...shocks]
        .sort((left, right) => right - left)
        .slice(0, 8)
        .map((shock) => {
          const point = scenarioPoint({
            coll: trove.coll,
            debt: figures.debt,
            price,
            shockBps: shock,
            mcr: trove.mcr,
            ccr: trove.ccr,
          })
          return {
            shockBps: shock,
            priceUsd: usd6(wadToMicro(point.price)),
            collateralRatioBps:
              point.ratio === null ? 0 : ratioToBps(point.ratio),
            band: point.band,
            requested: shock === requestedBps,
            isLiquidationRow: shock === liqShock,
          }
        })
      const block: LiquidationScenarioBlock = {
        type: "liquidation_scenario",
        version: 1,
        id: scope.id("b.scenario"),
        evidenceRefs: refs,
        asset: "BTC",
        base: {
          priceUsd: usd6(figures.priceMicro ?? 0n),
          collateralRatioBps: figures.ratioBps,
          liquidationPriceUsd: usd6(figures.liqMicro),
        },
        rows,
        thresholds: {
          minCollateralRatioBps: ratioToBps(trove.mcr),
          nearBandBps: ratioToBps(trove.ccr),
        },
        requestedOutcome: null,
        snapshotBlock: trove.blockNumber.toString(),
      }
      const facts: Fact[] = [
        makeFact({
          scope,
          key: "liq",
          label: "Liquidation price",
          value: { kind: "usd", usd: usd6(figures.liqMicro) },
          display: displayUsd(figures.liqMicro),
          status: "exact",
          evidenceRefs: refs,
        }),
      ]
      let text: string
      const requestedRow = rows.find((row) => row.requested)
      if (requestedRow && input.requested !== null) {
        const drop = makeFact({
          scope,
          key: "drop",
          label: "BTC drop",
          value: { kind: "bps", bps: requestedRow.shockBps },
          display: displayBps(requestedRow.shockBps),
          status: "projected",
          evidenceRefs: refs,
        })
        const ratio = makeFact({
          scope,
          key: "ratio",
          label: "Collateral ratio after drop",
          value: { kind: "bps", bps: requestedRow.collateralRatioBps },
          display: displayRatioBps(requestedRow.collateralRatioBps),
          status: "projected",
          evidenceRefs: refs,
        })
        facts.push(drop, ratio)
        block.requestedOutcome =
          requestedRow.band === "liquidatable"
            ? "liquidated"
            : requestedRow.band === "near_liquidation"
              ? "near_liquidation"
              : "safe"
        text =
          requestedRow.band === "liquidatable"
            ? `At BTC ${drop.display}, collateral ratio is ${ratio.display}: liquidatable. Liquidation starts below ${facts[0]?.display}.`
            : `At BTC ${drop.display}, collateral ratio is ${ratio.display}: not liquidated. Liquidation starts below ${facts[0]?.display}.`
      } else {
        const dropText =
          figures.dropBps === null ? null : displayBps(-figures.dropBps)
        if (dropText) {
          const drop = makeFact({
            scope,
            key: "drop",
            label: "Drop to liquidation",
            value: { kind: "bps", bps: -(figures.dropBps ?? 0) },
            display: dropText,
            status: "exact",
            evidenceRefs: refs,
          })
          facts.push(drop)
          text = `Liquidation starts below ${facts[0]?.display} per BTC, a ${drop.display} move.`
        } else {
          text = `Liquidation starts below ${facts[0]?.display} per BTC.`
        }
      }
      const blocks: UiBlock[] = [
        loanPositionBlock(scope, trove, figures, refs),
        block,
        sourceCluster(scope, evidence),
      ]
      return {
        tool,
        intent: "liquidation_scenario",
        status: "ok",
        title:
          input.requested !== null
            ? `If BTC falls ${input.requested}%, do I get liquidated?`
            : "Liquidation scenario",
        snapshot: {
          blockNumber: trove.blockNumber,
          epoch: null,
          label: `block ${displayBlock(trove.blockNumber)} · not a forecast`,
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
              text: "Deterministic model on the current snapshot. Not a forecast. Liquidation uses the protocol collateral ratio against its minimum.",
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
            "repay",
            "Review repayment",
            "repay max mUSD on my trove",
          ),
        ],
        trace: [
          traceItem({
            scope,
            key: "scenario",
            label: `Modelled ${rows.length} BTC price moves at block ${displayBlock(trove.blockNumber)}`,
            tool,
          }),
        ],
        model: {
          rows: [
            troveModelRow(trove, figures),
            ...rows.map((row) => ({
              drop: displayBps(row.shockBps),
              btcPrice: displayUsd(microFromUsd6(row.priceUsd)),
              ratio: displayRatioBps(row.collateralRatioBps),
              band: row.band,
            })),
          ],
          notes: ["Not a forecast."],
        },
        surface: "canvas",
      }
    } catch {
      return errorOutcome({
        scope: context.scope,
        tool,
        intent: "liquidation_scenario",
        title: "Liquidation scenario",
      })
    }
  },
})

export type RepayPlan = {
  trove: TroveSnapshot
  figures: TroveFigures
  amount: bigint
  mode: "partial" | "max_partial"
}

export async function buildRepayProposal(
  context: ToolContext,
  plan: RepayPlan,
): Promise<Proposal> {
  const { trove, figures, amount } = plan
  const data = encodeFunctionData({
    abi: BORROWER_OPERATIONS_ABI,
    functionName: "repayMUSD",
    // Zero hints are valid (SortedTroves re-finds the position); they only
    // cost gas.
    args: [amount, ZERO_ADDRESS, ZERO_ADDRESS],
  })
  const blockedReason: Proposal["blockedReason"] =
    trove.status !== "active"
      ? "trove_not_active"
      : trove.price === null
        ? "oracle_stale"
        : amount > figures.maxRepay
          ? "exceeds_max_repay"
          : trove.musdBalance < amount
            ? "insufficient_balance"
            : null
  const simulated = blockedReason
    ? [{ status: "not_run" as const, gasEstimate: null, reason: null }]
    : [
        await context.providers.simulateSingle(context.wallet.address, {
          to: MAINNET.borrowerOperations,
          data,
        }),
      ]
  const simulation = simulationOf(simulated, "eth_call")
  const debtAfter = figures.debt - amount
  const ratioAfter =
    trove.price === null
      ? null
      : collateralRatio(trove.coll, trove.price, debtAfter)
  const liqAfter = liquidationPrice(trove.mcr, debtAfter, trove.coll)
  const split = repaySplit(amount, trove.interest)
  const draft: ProposalDraft = {
    kind: "repay",
    chainId: 31_612,
    from: context.wallet.address,
    origin: "user_request",
    ...signability({
      walletMode: context.wallet.mode,
      simulation,
      blockedReason,
      needsApproval: false,
    }),
    createdAt: context.now().toISOString(),
    expiresAt: expiresAt("repay", context.now()),
    snapshotBlock: trove.blockNumber.toString(),
    calculationVersion: LOAN_CALC_VERSION,
    atomicity: "single",
    approvals: [],
    calls: [
      {
        index: 0,
        chainId: 31_612,
        from: context.wallet.address,
        to: MAINNET.borrowerOperations,
        data,
        value: "0x0",
        kind: "repay",
        label: `1 · Repay ${displayToken(MUSD(amount))}`,
        dependsOn: null,
        refreshAfterDependency: false,
      },
    ],
    simulation,
    quote: null,
    content: {
      kind: "repay",
      troveOwner: trove.owner,
      amount: MUSD(amount),
      mode: plan.mode,
      debtBefore: MUSD(figures.debt),
      debtAfter: MUSD(debtAfter),
      collateralRatioBeforeBps: figures.ratioBps,
      collateralRatioAfterBps:
        ratioAfter === null ? null : ratioToBps(ratioAfter),
      liquidationPriceBeforeUsd:
        figures.liqMicro === null ? null : usd6(figures.liqMicro),
      liquidationPriceAfterUsd:
        liqAfter === null ? null : usd6(wadToMicroCeilCent(liqAfter)),
      interestRepaid: MUSD(split.interestRepaid),
      principalRepaid: MUSD(split.principalRepaid),
    },
  }
  return sealProposal(draft, context.secret)
}

/** "5,000" / "5000.5" → 18-dp mUSD; "max" → the max partial repay. */
export function parseRepayAmount(
  text: string,
  maxRepay: bigint,
): { amount: bigint; mode: RepayPlan["mode"] } | null {
  const clean = text.trim().toLowerCase().replace(/,/g, "")
  if (clean === "max") return { amount: maxRepay, mode: "max_partial" }
  if (!/^\d+(?:\.\d{1,18})?$/.test(clean)) return null
  const amount = decimalToScaledBigInt(clean, 18)
  return amount > 0n ? { amount, mode: "partial" } : null
}

export const prepareRepayTool = defineTool({
  name: "prepare_repay",
  family: "loans",
  description:
    'Prepare an unsigned mUSD repayment on the selected wallet\'s trove (BorrowerOperations.repayMUSD; burns mUSD, no approval, one signature). amount is a decimal mUSD amount or "max" (largest partial repay that keeps the minimum net debt).',
  input: z.object({
    amount: z
      .string()
      .regex(/^(max|\d[\d,]*(?:\.\d{1,18})?)$/i)
      .describe('mUSD amount, e.g. "5000", or "max".'),
  }),
  async run(context, input) {
    const tool = "prepare_repay"
    if (context.wallet.address === ZERO_WALLET)
      return noTrove(context, tool, "repay")
    try {
      const trove = await readTrove(context)
      const figures = troveFigures(trove)
      if (trove.status !== "active") {
        return inactiveOutcome(context, tool, "repay", trove, figures)
      }
      const parsed = parseRepayAmount(input.amount, figures.maxRepay)
      if (!parsed) {
        return plainOutcome({
          scope: context.scope,
          tool,
          intent: "repay",
          status: "unavailable",
          title: "Review repayment",
          templateId: `${tool}.amount.v1`,
          text: 'Give a positive mUSD amount or "max".',
          kind: "unavailable",
          traceLabel: "Parsed amount",
        })
      }
      const proposal = await buildRepayProposal(context, {
        trove,
        figures,
        ...parsed,
      })
      return repayOutcome(context, trove, figures, proposal)
    } catch {
      return errorOutcome({
        scope: context.scope,
        tool,
        intent: "repay",
        title: "Review repayment",
      })
    }
  },
})

export function repayOutcome(
  context: ToolContext,
  trove: TroveSnapshot,
  figures: TroveFigures,
  proposal: Proposal,
): ToolOutcome {
  const { scope } = context
  const tool = "prepare_repay"
  const evidence = troveEvidence(scope, trove)
  const refs = evidence.map((item) => item.id)
  if (proposal.content.kind !== "repay")
    throw new Error("Expected a repay proposal")
  const content = proposal.content
  const amountFact = makeFact({
    scope,
    key: "amount",
    label: "You repay",
    value: { kind: "token", amount: content.amount },
    display: displayToken(content.amount),
    status: "exact",
    evidenceRefs: refs,
  })
  const debtAfter = makeFact({
    scope,
    key: "debt_after",
    label: "Debt after",
    value: { kind: "token", amount: content.debtAfter },
    display: displayToken(content.debtAfter),
    status: "projected",
    evidenceRefs: refs,
  })
  const facts: Fact[] = [amountFact, debtAfter]
  let text = `Repay ${amountFact.display}: debt goes to ${debtAfter.display}.`
  if (content.collateralRatioAfterBps !== null) {
    const ratioAfter = makeFact({
      scope,
      key: "ratio_after",
      label: "Collateral ratio after",
      value: { kind: "bps", bps: content.collateralRatioAfterBps },
      display: displayRatioBps(content.collateralRatioAfterBps),
      status: "projected",
      evidenceRefs: refs,
    })
    facts.push(ratioAfter)
    text = `Repay ${amountFact.display}: debt goes to ${debtAfter.display} and collateral ratio to ${ratioAfter.display}.`
  }
  if (proposal.blockedReason === "exceeds_max_repay") {
    const max = makeFact({
      scope,
      key: "max",
      label: "Max partial repay",
      value: { kind: "token", amount: MUSD(figures.maxRepay) },
      display: displayToken(MUSD(figures.maxRepay)),
      status: "exact",
      evidenceRefs: refs,
    })
    facts.push(max)
    text = `Above the max partial repay of ${max.display}; the trove must keep the minimum net debt.`
  } else if (proposal.blockedReason === "insufficient_balance") {
    const balance = makeFact({
      scope,
      key: "balance",
      label: "mUSD balance",
      value: { kind: "token", amount: MUSD(trove.musdBalance) },
      display: displayToken(MUSD(trove.musdBalance)),
      status: "live",
      evidenceRefs: refs,
    })
    facts.push(balance)
    text = `Wallet holds ${balance.display}, less than ${amountFact.display}.`
  }
  const effect = (
    key: string,
    label: string,
    before: string,
    after: string | null,
    factRefs: string[],
  ) => ({ key, label, before, after, unchanged: after === null, factRefs })
  const blocks: UiBlock[] = [
    loanPositionBlock(scope, trove, figures, refs),
    {
      type: "repay_review",
      version: 1,
      id: scope.id("b.review"),
      evidenceRefs: refs,
      proposalId: proposal.proposalId,
      title: "Review repayment",
      amount: content.amount,
      effects: [
        effect(
          "debt",
          "Debt",
          displayToken(content.debtBefore),
          displayToken(content.debtAfter),
          [debtAfter.id],
        ),
        effect(
          "collateral",
          "Collateral",
          displayToken(BTC(trove.coll), 4),
          null,
          [],
        ),
        effect(
          "ratio",
          "Collateral ratio",
          content.collateralRatioBeforeBps === null
            ? "Unpriced"
            : displayRatioBps(content.collateralRatioBeforeBps),
          content.collateralRatioAfterBps === null
            ? "Unpriced"
            : displayRatioBps(content.collateralRatioAfterBps),
          [],
        ),
        effect(
          "liq",
          "Liq. price",
          content.liquidationPriceBeforeUsd === null
            ? "—"
            : displayUsd(microFromUsd6(content.liquidationPriceBeforeUsd)),
          content.liquidationPriceAfterUsd === null
            ? "—"
            : displayUsd(microFromUsd6(content.liquidationPriceAfterUsd)),
          [],
        ),
        effect(
          "interest",
          "Interest repaid",
          displayToken(content.interestRepaid),
          null,
          [],
        ),
      ],
      approval: "not_required",
      simulation:
        proposal.simulation.status === "passed"
          ? "passed"
          : proposal.simulation.status === "not_run"
            ? "not_run"
            : "reverted",
      signatures: { count: 1, atomic: true },
      irreversibilityNote: "repay_not_reversible",
    },
    sourceCluster(scope, evidence),
  ]
  return {
    tool,
    intent: "repay",
    status: "ok",
    title: `Repay ${displayToken(content.amount)} on my trove`,
    snapshot: {
      blockNumber: trove.blockNumber,
      epoch: null,
      label: `block ${displayBlock(trove.blockNumber)}`,
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
          text: "repayMUSD burns mUSD directly: no approval, one atomic signature. Interest is repaid first.",
          factRefs: [],
        },
      ],
    },
    facts,
    evidence,
    blocks,
    proposals: [proposal],
    followups: [],
    trace: [
      traceItem({
        scope,
        key: "repay",
        label: `Simulated repayMUSD at block ${displayBlock(trove.blockNumber)}`,
        detail: proposal.simulation.status,
        tool,
      }),
    ],
    model: {
      rows: [
        troveModelRow(trove, figures),
        {
          repay: displayToken(content.amount),
          debtAfter: displayToken(content.debtAfter),
          ratioAfter:
            content.collateralRatioAfterBps === null
              ? null
              : displayRatioBps(content.collateralRatioAfterBps),
        },
      ],
      notes: [
        `Unsigned repay proposal ${proposal.proposalId}: ${proposal.status}${proposal.blockedReason ? ` (${proposal.blockedReason})` : ""}.`,
      ],
    },
    surface: "canvas",
  }
}

export async function buildSurplusProposal(
  context: ToolContext,
  trove: TroveSnapshot,
): Promise<Proposal> {
  const data = encodeFunctionData({
    abi: BORROWER_OPERATIONS_ABI,
    functionName: "claimCollateral",
  })
  const blockedReason: Proposal["blockedReason"] =
    trove.surplusCollateral > 0n ? null : "nothing_to_claim"
  const simulation = simulationOf(
    blockedReason
      ? [{ status: "not_run", gasEstimate: null, reason: null }]
      : [
          await context.providers.simulateSingle(context.wallet.address, {
            to: MAINNET.borrowerOperations,
            data,
          }),
        ],
    "eth_call",
  )
  const draft: ProposalDraft = {
    kind: "claim_surplus",
    chainId: 31_612,
    from: context.wallet.address,
    origin: "user_request",
    ...signability({
      walletMode: context.wallet.mode,
      simulation,
      blockedReason,
      needsApproval: false,
    }),
    createdAt: context.now().toISOString(),
    expiresAt: expiresAt("claim_surplus", context.now()),
    snapshotBlock: trove.blockNumber.toString(),
    calculationVersion: LOAN_CALC_VERSION,
    atomicity: "single",
    approvals: [],
    calls: [
      {
        index: 0,
        chainId: 31_612,
        from: context.wallet.address,
        to: MAINNET.borrowerOperations,
        data,
        value: "0x0",
        kind: "claim",
        label: `1 · Claim ${displayToken(BTC(trove.surplusCollateral), 4)} collateral surplus`,
        dependsOn: null,
        refreshAfterDependency: false,
      },
    ],
    simulation,
    quote: null,
    content: { kind: "claim_surplus", amount: BTC(trove.surplusCollateral) },
  }
  return sealProposal(draft, context.secret)
}

export const claimSurplusTool = defineTool({
  name: "claim_collateral_surplus",
  family: "loans",
  description:
    "Prepare an unsigned BorrowerOperations.claimCollateral() for BTC left in CollSurplusPool after the wallet's trove was redeemed or liquidated.",
  input: z.object({}),
  async run(context) {
    const tool = "claim_collateral_surplus"
    if (context.wallet.address === ZERO_WALLET) {
      return noTrove(context, tool, "claim_collateral_surplus")
    }
    try {
      const trove = await readTrove(context)
      const figures = troveFigures(trove)
      const { scope } = context
      if (trove.surplusCollateral <= 0n) {
        return plainOutcome({
          scope,
          tool,
          intent: "claim_collateral_surplus",
          status: "empty",
          title: "Collateral surplus",
          templateId: `${tool}.empty.v1`,
          text: "No collateral surplus to claim for this wallet.",
          kind: "empty",
          traceLabel: "Read CollSurplusPool",
          evidence: troveEvidence(scope, trove),
        })
      }
      const proposal = await buildSurplusProposal(context, trove)
      const evidence = troveEvidence(scope, trove)
      const refs = evidence.map((item) => item.id)
      const amount = makeFact({
        scope,
        key: "surplus",
        label: "Collateral surplus",
        value: { kind: "token", amount: BTC(trove.surplusCollateral) },
        display: displayToken(BTC(trove.surplusCollateral), 4),
        status: "live",
        evidenceRefs: refs,
      })
      return {
        tool,
        intent: "claim_collateral_surplus",
        status: "ok",
        title: "Claim collateral surplus",
        snapshot: {
          blockNumber: trove.blockNumber,
          epoch: null,
          label: `block ${displayBlock(trove.blockNumber)}`,
        },
        answer: {
          kind: "result",
          templateId: `${tool}.lead.v1`,
          text: `${amount.display} collateral surplus is claimable in one signature.`,
          factRefs: [amount.id],
        },
        why: null,
        facts: [amount],
        evidence,
        blocks: [
          loanPositionBlock(scope, trove, figures, refs),
          {
            type: "claim_review",
            version: 1,
            id: scope.id("b.claim"),
            evidenceRefs: refs,
            proposalId: proposal.proposalId,
            rows: [
              {
                rowKey: "collateral_surplus:wallet",
                source: "collateral_surplus",
                contract: MAINNET.collSurplusPool,
                tokenId: null,
                rewards: [
                  {
                    token: MAINNET.collSurplusPool,
                    amount: BTC(trove.surplusCollateral),
                    usd:
                      trove.price === null
                        ? null
                        : usd6(
                            wadToMicro(
                              (trove.surplusCollateral * trove.price) /
                                10n ** 18n,
                            ),
                          ),
                  },
                ],
                usd: null,
                unpricedCount: 0,
              },
            ],
            totalUsd: null,
            unpricedCount: 0,
            signatures: { count: 1, atomic: true },
            irreversibilityNote: "claim_final",
          },
          sourceCluster(scope, evidence),
        ],
        proposals: [proposal],
        followups: [],
        trace: [
          traceItem({
            scope,
            key: "surplus",
            label: "Simulated claimCollateral",
            detail: proposal.simulation.status,
            tool,
          }),
        ],
        model: { rows: [troveModelRow(trove, figures)], notes: [] },
        surface: "canvas",
      }
    } catch {
      return errorOutcome({
        scope: context.scope,
        tool,
        intent: "claim_collateral_surplus",
        title: "Collateral surplus",
      })
    }
  },
})
