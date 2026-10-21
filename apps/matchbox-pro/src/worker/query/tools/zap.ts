import { type Address, encodeFunctionData } from "viem"
import { z } from "zod"
import type {
  Approval,
  Evidence,
  Fact,
  Proposal,
  TransactionRequest,
  ZapRouteBlock,
} from "../../../features/query/contract"
import { decimalToScaledBigInt } from "../../../lib/money"
import { clarificationCard } from "../cards"
import {
  displayBlock,
  displayBps,
  displayToken,
  displayUsd,
  shortAddress,
  tokenAmount,
  usd6,
} from "../format"
import {
  type IdScope,
  type ToolOutcome,
  makeEvidence,
  makeFact,
  traceItem,
} from "../outcome"
import {
  PROPOSAL_TTL_MS,
  type ProposalDraft,
  callTarget,
  sealProposal,
  signability,
  simulationOf,
} from "../proposals"
import {
  ERC20_ABI,
  MAINNET,
  SAVINGS_ABI,
  SWAP_ROUTER_ABI,
} from "../providers/abis"
import {
  APPROVED_DESTINATIONS,
  APPROVED_ZAP_ROUTES,
  type ZapDestination,
  type ZapRoute,
  amountInForUsd,
  minOutFor,
  priceImpactBps,
} from "../providers/zap"
import { extractSlots } from "../router"
import { ZAP_CALC_VERSION } from "../versions"
import {
  ZERO_WALLET,
  calcEvidence,
  errorOutcome,
  plainOutcome,
  sourceCluster,
} from "./common"
import { type ToolContext, defineTool } from "./tool"

export const DEFAULT_SLIPPAGE_BPS = 50
const MAX_SLIPPAGE_BPS = 300
const SWAP_DEADLINE_SECONDS = 120n

const MEZO_AMOUNT = (raw: bigint) => tokenAmount(raw, 18, "MEZO")
const MUSD_AMOUNT = (raw: bigint) => tokenAmount(raw, 18, "mUSD")
const SHARES = (raw: bigint) => tokenAmount(raw, 18, "sMUSD")

export const zapInputSchema = z.object({
  fundingAsset: z
    .enum(["MEZO", "MUSD", "BTC"])
    .describe("Asset the user pays with."),
  amount: z
    .string()
    .regex(/^\d[\d,]*(?:\.\d{1,18})?$/)
    .nullable()
    .describe('Amount in the funding asset\'s units, e.g. "17400" MEZO.'),
  amountUsd: z
    .string()
    .regex(/^\d[\d,]*(?:\.\d{1,2})?$/)
    .nullable()
    .describe('USD notional, e.g. "50" for $50.'),
  destination: z
    .enum(["musd-savings", "lp-pool"])
    .describe(
      "musd-savings = MUSD Savings (sMUSD). lp-pool = a dual-deposit LP pool.",
    ),
  slippageBps: z.number().int().min(1).max(MAX_SLIPPAGE_BPS).nullable(),
})

export type ZapInput = z.infer<typeof zapInputSchema>

function decimal18(text: string): bigint {
  return decimalToScaledBigInt(text.replace(/,/g, ""), 18)
}

function routeBlockBase(
  scope: IdScope,
  destination: ZapDestination | null,
  kind: "single_sided" | "dual_deposit_lp",
): Pick<ZapRouteBlock, "type" | "version" | "id" | "destination"> {
  return {
    type: "zap_route",
    version: 1,
    id: scope.id("b.zap"),
    destination: destination
      ? {
          vaultId: destination.id,
          name: destination.name,
          address: destination.address,
          kind,
        }
      : { vaultId: "lp-pool", name: "LP pool", address: null, kind },
  }
}

function unavailableZap(
  context: ToolContext,
  tool: string,
  reason: NonNullable<ZapRouteBlock["unavailableReason"]>,
  text: string,
): ToolOutcome {
  const { scope } = context
  const dual = reason === "dual_deposit_unavailable"
  const savings = APPROVED_DESTINATIONS[0] ?? null
  return plainOutcome({
    scope,
    tool,
    intent: "zap",
    status: "unavailable",
    title: dual ? "Zap into an LP pool" : "Zap into MUSD Savings",
    templateId: `${tool}.${reason}.v1`,
    text,
    kind: "unavailable",
    traceLabel: "Checked approved routes",
    blocks: [
      {
        ...routeBlockBase(
          scope,
          dual ? null : savings,
          dual ? "dual_deposit_lp" : "single_sided",
        ),
        evidenceRefs: [],
        proposalId: null,
        status: "unavailable",
        unavailableReason: reason,
        steps: [],
        youPay: null,
        youPayUsd: null,
        quotedOut: null,
        minReceived: null,
        feeBps: null,
        priceImpactBps: null,
        priceImpactLevel: null,
        slippageBps: null,
        slippageEditable: false,
        approvals: [],
        shares: null,
        sharesExact: true,
        quoteExpiresAt: null,
        callCount: 0,
        atomicity: "sequential_non_atomic",
      },
    ],
  })
}

function approveCall(
  context: ToolContext,
  index: number,
  token: Address,
  spender: Address,
  amount: bigint,
  label: string,
  dependsOn: number | null,
): TransactionRequest {
  return {
    index,
    chainId: 31_612,
    from: context.wallet.address,
    to: token,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
    }),
    value: "0x0",
    kind: "approve",
    label: `${index + 1} · ${label}`,
    dependsOn,
    refreshAfterDependency: false,
  }
}

export type ZapBuild = {
  outcome: ToolOutcome
  proposal: Proposal | null
}

/** MEZO → mUSD on the approved CL route, then sMUSD deposit. */
export async function buildSwapZap(
  context: ToolContext,
  input: {
    route: ZapRoute
    destination: ZapDestination
    amountIn: bigint | null
    amountUsd: bigint | null
    slippageBps: number
    prepare: boolean
    tool: string
  },
): Promise<ZapBuild> {
  const { scope, providers, wallet } = context
  const { route, destination } = input
  const market = await providers.zapMarket(route)
  const amountIn =
    input.amountIn ??
    (input.amountUsd !== null
      ? amountInForUsd(input.amountUsd, market.mid)
      : 0n)
  if (amountIn <= 0n) {
    return {
      outcome: unavailableZap(
        context,
        input.tool,
        "quote_failed",
        "Amount must be above zero.",
      ),
      proposal: null,
    }
  }
  const quote = await providers.zapQuote(route, amountIn)
  const impact = priceImpactBps({
    amountIn,
    amountOut: quote.amountOut,
    mid: market.mid,
    feePips: market.feePips,
  })
  const minOut = minOutFor(quote.amountOut, input.slippageBps)
  const impactLevel: ZapRouteBlock["priceImpactLevel"] =
    impact > route.maxImpactBps
      ? "blocked"
      : impact > route.warnImpactBps
        ? "warn"
        : "ok"
  const amountInUsdMicro = (amountIn * market.mid) / 10n ** 18n / 10n ** 12n
  const now = context.now()
  const quoteExpiresAt = new Date(
    now.getTime() + PROPOSAL_TTL_MS.zap,
  ).toISOString()
  const deadline =
    BigInt(Math.floor(now.getTime() / 1000)) + SWAP_DEADLINE_SECONDS
  const feeBps = Math.round(market.feePips / 100)

  const [mezoPosition, musdPosition] = await Promise.all([
    providers.tokenPosition(route.tokenIn, wallet.address, route.router),
    providers.tokenPosition(
      route.tokenOut,
      wallet.address,
      destination.address,
    ),
  ])
  const insufficient = mezoPosition.balance < amountIn
  const blockedReason: Proposal["blockedReason"] =
    impactLevel === "blocked"
      ? "price_impact_too_high"
      : insufficient
        ? "insufficient_balance"
        : null

  const evidence: Evidence[] = [
    makeEvidence({
      scope,
      key: "quote",
      kind: "chain",
      label: "Quote · approved router",
      source: `${route.label} ${shortAddress(route.pool)}`,
      blockNumber: market.blockNumber.toString(),
      fetchedAt: now.toISOString(),
      status: "live",
    }),
    calcEvidence(
      scope,
      ZAP_CALC_VERSION,
      "QuoterV2 + slot0 mid, fee-adjusted impact",
      now.toISOString(),
    ),
  ]
  const refs = evidence.map((item) => item.id)

  // Calls: exact approvals only when allowance is short; deposit the
  // guaranteed minimum (re-sized to the actual swap output once it lands).
  const calls: TransactionRequest[] = []
  const approvals: Approval[] = []
  if (!blockedReason && input.prepare) {
    let swapDepends: number | null = null
    if (mezoPosition.allowance < amountIn) {
      calls.push(
        approveCall(
          context,
          calls.length,
          route.tokenIn,
          route.router,
          amountIn,
          `Approve ${displayToken(MEZO_AMOUNT(amountIn))}`,
          null,
        ),
      )
      approvals.push({
        token: route.tokenIn,
        spender: route.router,
        amount: MEZO_AMOUNT(amountIn),
        mode: "exact",
      })
      swapDepends = 0
    }
    const swapIndex = calls.length
    calls.push({
      index: swapIndex,
      chainId: 31_612,
      from: wallet.address,
      to: route.router,
      data: encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: route.tokenIn,
            tokenOut: route.tokenOut,
            tickSpacing: route.tickSpacing,
            recipient: wallet.address,
            deadline,
            amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0n,
          },
        ],
      }),
      value: "0x0",
      kind: "swap",
      label: `${swapIndex + 1} · Swap ${displayToken(MEZO_AMOUNT(amountIn))} → min ${displayToken(MUSD_AMOUNT(minOut))}`,
      dependsOn: swapDepends,
      refreshAfterDependency: false,
    })
    let depositDepends = swapIndex
    if (musdPosition.allowance < minOut) {
      calls.push(
        approveCall(
          context,
          calls.length,
          route.tokenOut,
          destination.address,
          minOut,
          `Approve ${displayToken(MUSD_AMOUNT(minOut))}`,
          swapIndex,
        ),
      )
      approvals.push({
        token: route.tokenOut,
        spender: destination.address,
        amount: MUSD_AMOUNT(minOut),
        mode: "exact",
      })
      depositDepends = calls.length - 1
    }
    calls.push({
      index: calls.length,
      chainId: 31_612,
      from: wallet.address,
      to: destination.address,
      data: encodeFunctionData({
        abi: SAVINGS_ABI,
        functionName: "deposit",
        args: [minOut],
      }),
      value: "0x0",
      kind: "deposit",
      label: `${calls.length + 1} · Deposit ${displayToken(MUSD_AMOUNT(minOut))} into ${destination.name}`,
      dependsOn: depositDepends,
      refreshAfterDependency: true,
    })
  }
  let proposal: Proposal | null = null
  // A blocked quote still yields a (call-less, unsignable) proposal so a
  // refresh can report why it can no longer be signed.
  if (input.prepare) {
    const simulated = calls.length
      ? await providers.simulateSequence(wallet.address, calls.map(callTarget))
      : []
    const simulation = simulationOf(simulated, "eth_simulateV1")
    const draft: ProposalDraft = {
      kind: "zap",
      chainId: 31_612,
      from: wallet.address,
      origin: "user_request",
      ...signability({
        walletMode: wallet.mode,
        simulation,
        blockedReason,
        needsApproval: approvals.length > 0,
      }),
      createdAt: now.toISOString(),
      expiresAt: quoteExpiresAt,
      snapshotBlock: market.blockNumber.toString(),
      calculationVersion: ZAP_CALC_VERSION,
      atomicity: "sequential_non_atomic",
      approvals,
      calls,
      simulation,
      quote: {
        routerId: route.routeId,
        router: route.router,
        pool: route.pool,
        amountIn: MEZO_AMOUNT(amountIn),
        amountInUsd: usd6(amountInUsdMicro),
        quotedOut: MUSD_AMOUNT(quote.amountOut),
        minOut: MUSD_AMOUNT(minOut),
        feeBps,
        priceImpactBps: impact,
        maxPriceImpactBps: route.maxImpactBps,
        slippageBps: input.slippageBps,
        quotedAt: now.toISOString(),
        expiresAt: quoteExpiresAt,
        deadline: Number(deadline),
      },
      content: {
        kind: "zap",
        fundingAsset: "MEZO",
        destinationId: destination.id,
        depositAmount: MUSD_AMOUNT(minOut),
        expectedShares: SHARES(minOut),
      },
    }
    proposal = await sealProposal(draft, context.secret)
    evidence.push(
      makeEvidence({
        scope,
        key: "sim",
        kind: "chain",
        label: `Simulated · ${simulation.status}`,
        source: "eth_simulateV1 (stateful)",
        blockNumber: market.blockNumber.toString(),
        fetchedAt: now.toISOString(),
        status: "live",
      }),
    )
  }

  const payFact = makeFact({
    scope,
    key: "pay",
    label: "You pay",
    value: { kind: "token", amount: MEZO_AMOUNT(amountIn) },
    display: displayToken(MEZO_AMOUNT(amountIn)),
    status: "exact",
    evidenceRefs: refs,
  })
  const payUsdFact = makeFact({
    scope,
    key: "pay_usd",
    label: "You pay (USD)",
    value: { kind: "usd", usd: usd6(amountInUsdMicro) },
    display: displayUsd(amountInUsdMicro),
    status: "estimated",
    evidenceRefs: refs,
  })
  const minFact = makeFact({
    scope,
    key: "min",
    label: "Min received",
    value: { kind: "token", amount: MUSD_AMOUNT(minOut) },
    display: displayToken(MUSD_AMOUNT(minOut)),
    status: "exact",
    evidenceRefs: refs,
  })
  const impactFact = makeFact({
    scope,
    key: "impact",
    label: "Price impact",
    value: { kind: "bps", bps: impact },
    display: displayBps(impact),
    status: "estimated",
    evidenceRefs: refs,
  })
  const maxFact = makeFact({
    scope,
    key: "max_impact",
    label: "Price impact cap",
    value: { kind: "bps", bps: route.maxImpactBps },
    display: displayBps(route.maxImpactBps),
    status: "exact",
    evidenceRefs: [refs[1] ?? ""],
  })
  const facts: Fact[] = [payFact, payUsdFact, minFact, impactFact, maxFact]
  let text = `Zap ${payFact.display} (${payUsdFact.display}) into ${destination.name}: min received ${minFact.display}, price impact ${impactFact.display}.`
  if (impactLevel === "blocked") {
    text = `Price impact ${impactFact.display} is above the ${maxFact.display} cap on this route. Use a smaller amount.`
  } else if (insufficient) {
    const balance = makeFact({
      scope,
      key: "balance",
      label: "MEZO balance",
      value: { kind: "token", amount: MEZO_AMOUNT(mezoPosition.balance) },
      display: displayToken(MEZO_AMOUNT(mezoPosition.balance)),
      status: "live",
      evidenceRefs: refs,
    })
    facts.push(balance)
    text = `Wallet holds ${balance.display}, less than ${payFact.display}.`
  }

  const block: ZapRouteBlock = {
    ...routeBlockBase(scope, destination, "single_sided"),
    evidenceRefs: refs,
    proposalId: proposal?.proposalId ?? null,
    status:
      impactLevel === "blocked" || insufficient
        ? "blocked"
        : wallet.mode !== "connected" && input.prepare
          ? "read_only"
          : "quoted",
    unavailableReason:
      impactLevel === "blocked"
        ? "price_impact_too_high"
        : insufficient
          ? "insufficient_balance"
          : null,
    steps: [
      {
        index: 1,
        kind: "fund",
        label: displayToken(MEZO_AMOUNT(amountIn)),
        amount: MEZO_AMOUNT(amountIn),
      },
      {
        index: 2,
        kind: "swap",
        label: "Swap on approved router",
        amount: null,
      },
      {
        index: 3,
        kind: "quote",
        label: `${displayToken(MUSD_AMOUNT(quote.amountOut))} quoted`,
        amount: MUSD_AMOUNT(quote.amountOut),
      },
      {
        index: 4,
        kind: "deposit",
        label: `Deposit ${destination.name}`.slice(0, 60),
        amount: MUSD_AMOUNT(minOut),
      },
    ],
    youPay: MEZO_AMOUNT(amountIn),
    youPayUsd: usd6(amountInUsdMicro),
    quotedOut: MUSD_AMOUNT(quote.amountOut),
    minReceived: MUSD_AMOUNT(minOut),
    feeBps,
    priceImpactBps: impact,
    priceImpactLevel: impactLevel,
    slippageBps: input.slippageBps,
    slippageEditable: true,
    approvals,
    shares: SHARES(minOut),
    sharesExact: true,
    quoteExpiresAt,
    callCount: proposal?.calls.length ?? 0,
    atomicity: "sequential_non_atomic",
  }
  const outcome: ToolOutcome = {
    tool: input.tool,
    intent: "zap",
    status: blockedReason ? "unavailable" : "ok",
    title: `Zap ${displayUsd(amountInUsdMicro)} MEZO into ${destination.name}`,
    snapshot: {
      blockNumber: market.blockNumber,
      epoch: null,
      label: `block ${displayBlock(market.blockNumber)} · approved route`,
    },
    answer: {
      kind: blockedReason ? "unavailable" : "result",
      templateId: `${input.tool}.${blockedReason ?? "lead"}.v1`,
      text,
      factRefs: facts.map((fact) => fact.id),
    },
    why: {
      templateId: `${input.tool}.why.v1`,
      items: [
        {
          text: `Only the approved ${route.label} route is quoted. sMUSD mints one share per mUSD deposited, so shares equal the deposit.`,
          factRefs: [],
        },
      ],
    },
    facts,
    evidence,
    blocks: [block, sourceCluster(scope, evidence)],
    proposals: proposal ? [proposal] : [],
    followups: [],
    trace: [
      traceItem({
        scope,
        key: "quote",
        label: `Quoted ${displayToken(MEZO_AMOUNT(amountIn))} on ${route.label}`,
        tool: input.tool,
      }),
      ...(proposal
        ? [
            traceItem({
              scope,
              key: "sim",
              label: `Simulated ${proposal.calls.length} calls in one eth_simulateV1 block`,
              detail: proposal.simulation.status,
              tool: input.tool,
            }),
          ]
        : []),
    ],
    model: {
      rows: [
        {
          pay: payFact.display,
          payUsd: payUsdFact.display,
          quoted: displayToken(MUSD_AMOUNT(quote.amountOut)),
          minReceived: minFact.display,
          impact: impactFact.display,
          impactCap: maxFact.display,
          slippage: displayBps(input.slippageBps),
          fee: displayBps(feeBps),
        },
      ],
      notes: proposal
        ? [
            `Unsigned zap proposal ${proposal.proposalId}: ${proposal.status}; quote expires ${quoteExpiresAt}.`,
          ]
        : [],
    },
    surface: "canvas",
  }
  return { outcome, proposal }
}

/** mUSD already in the wallet → exact approve (if short) + sMUSD deposit. */
export async function buildSavingsDeposit(
  context: ToolContext,
  input: { destination: ZapDestination; amount: bigint; tool: string },
): Promise<ZapBuild> {
  const { scope, providers, wallet } = context
  const { destination, amount } = input
  const position = await providers.tokenPosition(
    MAINNET.musd,
    wallet.address,
    destination.address,
  )
  const now = context.now()
  const insufficient = position.balance < amount
  const calls: TransactionRequest[] = []
  const approvals: Approval[] = []
  if (!insufficient) {
    if (position.allowance < amount) {
      calls.push(
        approveCall(
          context,
          0,
          MAINNET.musd,
          destination.address,
          amount,
          `Approve ${displayToken(MUSD_AMOUNT(amount))}`,
          null,
        ),
      )
      approvals.push({
        token: MAINNET.musd,
        spender: destination.address,
        amount: MUSD_AMOUNT(amount),
        mode: "exact",
      })
    }
    calls.push({
      index: calls.length,
      chainId: 31_612,
      from: wallet.address,
      to: destination.address,
      data: encodeFunctionData({
        abi: SAVINGS_ABI,
        functionName: "deposit",
        args: [amount],
      }),
      value: "0x0",
      kind: "deposit",
      label: `${calls.length + 1} · Deposit ${displayToken(MUSD_AMOUNT(amount))}`,
      dependsOn: calls.length > 0 ? 0 : null,
      refreshAfterDependency: false,
    })
  }
  const simulated = calls.length
    ? await providers.simulateSequence(wallet.address, calls.map(callTarget))
    : []
  const simulation = simulationOf(simulated, "eth_simulateV1")
  const draft: ProposalDraft = {
    kind: "earn_deposit",
    chainId: 31_612,
    from: wallet.address,
    origin: "user_request",
    ...signability({
      walletMode: wallet.mode,
      simulation,
      blockedReason: insufficient ? "insufficient_balance" : null,
      needsApproval: approvals.length > 0,
    }),
    createdAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + PROPOSAL_TTL_MS.earn_deposit,
    ).toISOString(),
    snapshotBlock: position.blockNumber.toString(),
    calculationVersion: ZAP_CALC_VERSION,
    atomicity: calls.length > 1 ? "sequential_non_atomic" : "single",
    approvals,
    calls,
    simulation,
    quote: null,
    content: {
      kind: "earn_deposit",
      destinationId: destination.id,
      amount: MUSD_AMOUNT(amount),
    },
  }
  const proposal = await sealProposal(draft, context.secret)
  const evidence: Evidence[] = [
    makeEvidence({
      scope,
      key: "wallet",
      kind: "chain",
      label: "mUSD balance · live",
      source: `MUSD ${shortAddress(MAINNET.musd)}`,
      blockNumber: position.blockNumber.toString(),
      fetchedAt: now.toISOString(),
      status: "live",
    }),
  ]
  const refs = evidence.map((item) => item.id)
  const amountFact = makeFact({
    scope,
    key: "amount",
    label: "Deposit",
    value: { kind: "token", amount: MUSD_AMOUNT(amount) },
    display: displayToken(MUSD_AMOUNT(amount)),
    status: "exact",
    evidenceRefs: refs,
  })
  const facts: Fact[] = [amountFact]
  let text = `Deposit ${amountFact.display} into ${destination.name}; sMUSD mints one share per mUSD.`
  if (insufficient) {
    const balance = makeFact({
      scope,
      key: "balance",
      label: "mUSD balance",
      value: { kind: "token", amount: MUSD_AMOUNT(position.balance) },
      display: displayToken(MUSD_AMOUNT(position.balance)),
      status: "live",
      evidenceRefs: refs,
    })
    facts.push(balance)
    text = `Wallet holds ${balance.display}, less than ${amountFact.display}.`
  }
  const block: ZapRouteBlock = {
    ...routeBlockBase(scope, destination, "single_sided"),
    evidenceRefs: refs,
    proposalId: proposal.proposalId,
    status: insufficient
      ? "blocked"
      : wallet.mode !== "connected"
        ? "read_only"
        : "quoted",
    unavailableReason: insufficient ? "insufficient_balance" : null,
    steps: [
      {
        index: 1,
        kind: "fund",
        label: displayToken(MUSD_AMOUNT(amount)),
        amount: MUSD_AMOUNT(amount),
      },
      {
        index: 2,
        kind: "deposit",
        label: `Deposit ${destination.name}`.slice(0, 60),
        amount: MUSD_AMOUNT(amount),
      },
    ],
    youPay: MUSD_AMOUNT(amount),
    youPayUsd: null,
    quotedOut: null,
    minReceived: MUSD_AMOUNT(amount),
    feeBps: null,
    priceImpactBps: null,
    priceImpactLevel: null,
    slippageBps: null,
    slippageEditable: false,
    approvals,
    shares: SHARES(amount),
    sharesExact: true,
    quoteExpiresAt: null,
    callCount: calls.length,
    atomicity: calls.length > 1 ? "sequential_non_atomic" : "single",
  }
  return {
    proposal,
    outcome: {
      tool: input.tool,
      intent: "earn_deposit",
      status: insufficient ? "unavailable" : "ok",
      title: `Deposit mUSD into ${destination.name}`,
      snapshot: {
        blockNumber: position.blockNumber,
        epoch: null,
        label: `block ${displayBlock(position.blockNumber)}`,
      },
      answer: {
        kind: insufficient ? "unavailable" : "result",
        templateId: `${input.tool}.savings.v1`,
        text,
        factRefs: facts.map((fact) => fact.id),
      },
      why: null,
      facts,
      evidence,
      blocks: [block, sourceCluster(scope, evidence)],
      proposals: [proposal],
      followups: [],
      trace: [
        traceItem({
          scope,
          key: "deposit",
          label: "Checked mUSD balance and allowance",
          detail: simulation.status,
          tool: input.tool,
        }),
      ],
      model: { rows: [{ deposit: amountFact.display }], notes: [] },
      surface: "canvas",
    },
  }
}

async function runZap(
  context: ToolContext,
  input: ZapInput,
  prepare: boolean,
): Promise<ToolOutcome> {
  const tool = prepare ? "prepare_zap" : "quote_zap"
  if (input.destination === "lp-pool") {
    return unavailableZap(
      context,
      tool,
      "dual_deposit_unavailable",
      "No approved dual-deposit zap router. LP zaps are unavailable; nothing was rerouted to Savings.",
    )
  }
  if (input.fundingAsset === "BTC") {
    return unavailableZap(
      context,
      tool,
      "unsupported_asset",
      "No approved BTC route into MUSD Savings. MEZO and mUSD are supported.",
    )
  }
  if (input.amount === null && input.amountUsd === null) {
    const card = clarificationCard(context.scope, "zap-amount", {
      ...extractSlots(""),
      fundingAsset: input.fundingAsset,
      destination: input.destination,
    })
    return plainOutcome({
      scope: context.scope,
      tool,
      intent: "clarify",
      status: "clarify",
      title: "How much?",
      templateId: `${tool}.amount.v1`,
      text: "Pick an amount.",
      kind: "clarification",
      traceLabel: "Amount missing",
      blocks: card ? [card] : [],
    })
  }
  if (prepare && context.wallet.address === ZERO_WALLET) {
    return plainOutcome({
      scope: context.scope,
      tool,
      intent: "zap",
      status: "empty",
      title: "Zap into MUSD Savings",
      templateId: `${tool}.no_wallet.v1`,
      text: "Connect or watch a wallet to prepare a zap.",
      kind: "empty",
      traceLabel: "No wallet selected",
    })
  }
  const destination = APPROVED_DESTINATIONS.find(
    (item) => item.id === input.destination,
  )
  const route = APPROVED_ZAP_ROUTES[0]
  if (!destination || !route) {
    return unavailableZap(
      context,
      tool,
      "no_approved_router",
      "No approved route for this destination.",
    )
  }
  try {
    if (input.fundingAsset === "MUSD") {
      const amount = decimal18(input.amount ?? input.amountUsd ?? "0")
      return (await buildSavingsDeposit(context, { destination, amount, tool }))
        .outcome
    }
    return (
      await buildSwapZap(context, {
        route,
        destination,
        amountIn: input.amount !== null ? decimal18(input.amount) : null,
        amountUsd: input.amountUsd !== null ? decimal18(input.amountUsd) : null,
        slippageBps: input.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
        prepare,
        tool,
      })
    ).outcome
  } catch {
    return errorOutcome({
      scope: context.scope,
      tool,
      intent: "zap",
      title: "Zap into MUSD Savings",
    })
  }
}

export const prepareZapTool = defineTool({
  name: "prepare_zap",
  family: "earn",
  description:
    "Prepare an unsigned zap into MUSD Savings (sMUSD): MEZO is swapped to mUSD on the approved Tigris CL route (price-impact cap, exact approvals, min-out) then deposited; mUSD deposits directly. LP pools are unavailable. Requires an amount (token or USD) and an explicit destination.",
  input: zapInputSchema,
  run: (context, input) => runZap(context, input, true),
})

export const quoteZapTool = defineTool({
  name: "quote_zap",
  family: "earn",
  description:
    "Quote only (no transactions): how much mUSD a MEZO amount buys on the approved route, with price impact and min-out.",
  input: zapInputSchema,
  run: (context, input) => runZap(context, input, false),
})
