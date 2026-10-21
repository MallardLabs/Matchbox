import type {
  ClarificationCardId,
  Intent,
  VoteBranch,
} from "../../features/query/contract"

// Deterministic intent router. It runs before Claude at zero token cost and
// handles every request it recognises with confidence. Ambiguous requests
// become clarification cards and never reach a write tool.

export type QuerySlots = {
  amountUsd: string | null
  amount: string | null
  fundingAsset: "MEZO" | "MUSD" | "BTC" | null
  destination: "musd-savings" | "lp-pool" | null
  branch: VoteBranch | null
  veBTCOnly: boolean
  window: 4 | 8 | 12 | null
  shockPercent: number | null
  repayAmount: string | null
  allocations: Array<{ target: string; percent: string }> | null
  invalidAllocation: boolean
  direction: "in" | "out" | null
}

export type RouterDecision =
  | { kind: "tool"; intent: Intent; tool: string; input: unknown }
  | { kind: "clarify"; cardId: ClarificationCardId; slots: QuerySlots }
  | { kind: "navigate"; to: string; label: string }
  | { kind: "none" }

const PERSONAL =
  /\b(optimi[sz]e|for me|my votes?|my ballot|best return|personal return|what should i vote|how should i vote|vote this epoch for me)\b/

function match(pattern: RegExp, text: string): string | null {
  return pattern.exec(text)?.[1] ?? null
}

function parseAllocations(query: string): {
  allocations: Array<{ target: string; percent: string }> | null
  invalid: boolean
} {
  const segments = query
    .replace(/^.*?\b(vote|ballot|allocate)\b[^\d]*?(?=\d)/i, "")
    .split(/,|;|\band\b(?=\s*\d)|\n/i)
  const allocations: Array<{ target: string; percent: string }> = []
  let invalid = false
  for (const segment of segments) {
    const found = /(\d+(?:\.\d+)?)\s*%\s*(?:to|on|for|into)?\s*(.+)$/i.exec(
      segment.trim(),
    )
    if (!found) continue
    const percent = found[1] ?? ""
    const target = (found[2] ?? "").trim().replace(/[.!?]+$/, "")
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(percent) || !target) {
      invalid = true
      continue
    }
    allocations.push({ target: target.slice(0, 80), percent })
  }
  return { allocations: allocations.length ? allocations : null, invalid }
}

export function extractSlots(query: string): QuerySlots {
  const text = query.toLowerCase()
  const usd = match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/, text)
  const tokenAmount = /(\d[\d,]*(?:\.\d+)?)\s*(mezo|musd|btc)\b/.exec(
    text.replace(/\$\s?\d[\d,]*(?:\.\d{1,2})?/g, " "),
  )
  const assetWord = match(
    /\b(mezo|musd|btc)\b/,
    text.replace(/\bmezo\s*\/\s*musd\b|\bbtc\s*\/\s*musd\b/g, " "),
  )
  const fundingAsset = (tokenAmount?.[2] ?? assetWord)?.toUpperCase() ?? null
  const lp = /\b(lp|liquidity)\b|\bpool\b|(mezo|btc)\s*\/\s*musd\s+pool/.test(
    text,
  )
  const savings =
    /\b(savings|smusd|musd vault|musd savings)\b/.test(text) &&
    !/\b(mezo|btc)\s*\/\s*musd\b/.test(text)
  const windowText = match(/\b(4|8|12)\s*(?:completed\s+)?epochs?\b/, text)
  const shock =
    match(
      /\b(?:falls?|drops?|dips?|crash(?:es)?|declines?|down|loses?)\s*(?:by\s*)?(\d{1,2})\s*%/,
      text,
    ) ?? match(/\bbtc\s*[-−]\s*(\d{1,2})\s*%/, text)
  const repay = match(/\brepay\w*\s+(max|\$?\d[\d,]*(?:\.\d{1,18})?)/, text)
  const parsed = parseAllocations(query)
  const validators = /\bvalidators?\b/.test(text)
  const pools = /\b(pool voting|pools? ballot|vote on pools|pools)\b/.test(text)
  return {
    amountUsd: usd,
    amount: tokenAmount ? (tokenAmount[1] ?? null) : null,
    fundingAsset:
      fundingAsset === "MEZO" ||
      fundingAsset === "MUSD" ||
      fundingAsset === "BTC"
        ? fundingAsset
        : null,
    destination: lp ? "lp-pool" : savings ? "musd-savings" : null,
    branch: validators ? "validators" : pools ? "pools" : null,
    veBTCOnly: /\bvebtc\b/.test(text) && !validators && !pools,
    window:
      windowText === "4"
        ? 4
        : windowText === "12"
          ? 12
          : windowText === "8"
            ? 8
            : null,
    shockPercent: shock ? Number.parseInt(shock, 10) : null,
    repayAmount: repay ? repay.replace(/^\$/, "") : null,
    allocations: parsed.allocations,
    invalidAllocation: parsed.invalid,
    direction: /\b(into|to) mezo\b/.test(text)
      ? "in"
      : /\b(out of|from) mezo\b/.test(text)
        ? "out"
        : null,
  }
}

const PAGES: Record<string, { to: string; label: string }> = {
  overview: { to: "/", label: "Overview" },
  home: { to: "/", label: "Overview" },
  vote: { to: "/vote", label: "Vote" },
  voting: { to: "/vote", label: "Vote" },
  rewards: { to: "/rewards", label: "Rewards" },
  activity: { to: "/activity", label: "Activity" },
}

export function zapDecision(slots: QuerySlots): RouterDecision {
  if (slots.destination === "lp-pool") {
    return {
      kind: "tool",
      intent: "zap",
      tool: "prepare_zap",
      input: {
        fundingAsset: slots.fundingAsset ?? "MEZO",
        amount: slots.amount,
        amountUsd: slots.amountUsd,
        destination: "lp-pool",
        slippageBps: null,
      },
    }
  }
  if (slots.destination === null) {
    return { kind: "clarify", cardId: "earn-destination", slots }
  }
  if (slots.amount === null && slots.amountUsd === null) {
    return { kind: "clarify", cardId: "zap-amount", slots }
  }
  if (slots.fundingAsset === null) {
    return { kind: "clarify", cardId: "funding-asset", slots }
  }
  return {
    kind: "tool",
    intent: slots.fundingAsset === "MUSD" ? "earn_deposit" : "zap",
    tool: "prepare_zap",
    input: {
      fundingAsset: slots.fundingAsset,
      amount: slots.amount,
      amountUsd: slots.amountUsd,
      destination: slots.destination,
      slippageBps: null,
    },
  }
}

export function routeQuery(query: string): RouterDecision {
  const text = query.toLowerCase().trim()
  const slots = extractSlots(query)

  const page =
    /^(?:go to|open|take me to|show me the)\s+(overview|home|vote|voting|rewards|activity)(?:\s+page)?$/.exec(
      text,
    )
  if (page) {
    const target = PAGES[page[1] ?? ""]
    if (target) return { kind: "navigate", ...target }
  }

  if (
    /\b(report (?:a |an )?(?:bug|problem|issue)|contact support|support report|file a report|send (?:a )?report)\b/.test(
      text,
    )
  ) {
    return {
      kind: "tool",
      intent: "support_report",
      tool: "draft_support_report",
      input: { problem: query.slice(0, 2_000), kind: null },
    }
  }

  if (/\b(wormhole|portal)\b/.test(text)) {
    return {
      kind: "tool",
      intent: "bridge_search",
      tool: "search_transactions",
      input: { provider: "wormhole", direction: slots.direction, limit: null },
    }
  }
  if (/\bbridg(?:e|es|ed|ing)\b/.test(text)) {
    return {
      kind: "tool",
      intent: "bridge_search",
      tool: "search_transactions",
      input: { provider: "all", direction: slots.direction, limit: null },
    }
  }

  const loanWords =
    /\b(troves?|loans?|borrow\w*|debt|liquidat\w*|collateral ratio|repay\w*|surplus)\b/.test(
      text,
    )
  if (loanWords) {
    if (/\b(surplus|claim (?:my |the )?(?:btc )?collateral)\b/.test(text)) {
      return {
        kind: "tool",
        intent: "claim_collateral_surplus",
        tool: "claim_collateral_surplus",
        input: {},
      }
    }
    if (/\brepay\w*\b/.test(text)) {
      if (slots.repayAmount === null) {
        return { kind: "clarify", cardId: "repay-amount", slots }
      }
      return {
        kind: "tool",
        intent: "repay",
        tool: "prepare_repay",
        input: { amount: slots.repayAmount },
      }
    }
    if (slots.shockPercent !== null || /\bliquidat\w*\b/.test(text)) {
      return {
        kind: "tool",
        intent: "liquidation_scenario",
        tool: "scenario_liquidation",
        input: {
          drops: null,
          requested:
            slots.shockPercent !== null &&
            slots.shockPercent >= 1 &&
            slots.shockPercent <= 99
              ? slots.shockPercent
              : null,
        },
      }
    }
    return {
      kind: "tool",
      intent: "loan_position",
      tool: "get_loan_position",
      input: {},
    }
  }
  if (slots.shockPercent !== null && /\bbtc\b/.test(text)) {
    return {
      kind: "tool",
      intent: "liquidation_scenario",
      tool: "scenario_liquidation",
      input: { drops: null, requested: slots.shockPercent },
    }
  }

  if (/\b(claim|claimable|rewards?|bribes?|earned|earnings)\b/.test(text)) {
    const prepare = /\bclaim\b/.test(text) && !/\bclaimable\b/.test(text)
    return {
      kind: "tool",
      intent: "claim_rewards",
      tool: prepare ? "prepare_claim" : "list_claimable_rewards",
      input: { sources: null, lockIds: null },
    }
  }

  if (/\b(zap|vaults?|savings|smusd|deposit)\b/.test(text)) {
    return zapDecision(slots)
  }

  if (slots.allocations && /\b(vote|ballot|allocate)\b/.test(text)) {
    return {
      kind: "tool",
      intent: "custom_vote",
      tool: "prepare_vote",
      input: { branch: slots.branch, allocations: slots.allocations },
    }
  }
  if (
    /\b(most|highest|largest|biggest)\s+(?:deposited\s+)?(?:incentives?|bribes?)\b/.test(
      text,
    )
  ) {
    return {
      kind: "tool",
      intent: "rank_gauges",
      tool: "rank_gauges",
      input: {
        objective: "most_incentives_deposited",
        branch: slots.branch,
        window: null,
      },
    }
  }
  if (/\bconsistent(?:ly)?\b/.test(text)) {
    return {
      kind: "tool",
      intent: "rank_gauges",
      tool: "rank_gauges",
      input: {
        objective: "most_consistently_funded",
        branch: slots.branch,
        window: slots.window ?? 8,
      },
    }
  }
  const personal = PERSONAL.test(text)
  if (
    /\b(best|top|good)\b/.test(text) &&
    /\b(gauges?|validators?|pools?)\b/.test(text) &&
    !personal
  ) {
    return { kind: "clarify", cardId: "gauge-objective", slots }
  }
  if (personal) {
    if (slots.veBTCOnly)
      return { kind: "clarify", cardId: "voting-domain", slots }
    return {
      kind: "tool",
      intent: "optimize_votes",
      tool: "optimize_votes",
      input: { branch: slots.branch, lockIds: null },
    }
  }
  if (/\bvot(?:e|es|ing)\b/.test(text)) {
    return { kind: "clarify", cardId: "gauge-objective", slots }
  }

  if (
    /\b(my locks?|voting power|my wallet|my positions?|my vemezo|my vebtc)\b/.test(
      text,
    )
  ) {
    return {
      kind: "tool",
      intent: "navigate",
      tool: "get_wallet_context",
      input: {},
    }
  }
  return { kind: "none" }
}
