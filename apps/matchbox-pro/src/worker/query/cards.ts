import type {
  ClarificationCardBlock,
  ClarificationCardId,
} from "../../features/query/contract"
import type { IdScope } from "./outcome"
import { type QuerySlots, type RouterDecision, zapDecision } from "./router"

// Server-owned clarification table: cardId → optionId → deterministic tool
// call. The client only ever returns {cardId, optionId}; the server validates
// the option and runs the tool without Claude. Follow-on cards carry the
// answers so far inside their option ids.

type CardOption = ClarificationCardBlock["options"][number]

const AMOUNT_PRESETS = ["10", "50", "100"]
const DESTINATIONS = ["musd-savings", "lp-pool"] as const
const FUNDING = ["MEZO", "MUSD"] as const
const BRANCHES = ["boost", "validators", "pools"] as const

function option(
  id: string,
  label: string,
  detail: string,
  availability: CardOption["availability"] = "available",
): CardOption {
  return { id, label, detail, availability }
}

export function clarificationCard(
  scope: IdScope,
  cardId: ClarificationCardId,
  slots: QuerySlots,
): ClarificationCardBlock | null {
  const base = {
    type: "clarification_card" as const,
    version: 1 as const,
    id: scope.id("b.card"),
    evidenceRefs: [],
    cardId,
  }
  if (cardId === "gauge-objective") {
    return {
      ...base,
      prompt: "Best by which measure?",
      options: [
        option(
          "best_personal_return",
          "Best return for me",
          "Optimizer · projected USD for your locks",
        ),
        option(
          "most_incentives_deposited",
          "Most incentives deposited",
          "Gross priced incentives this epoch",
        ),
        option(
          "most_consistently_funded",
          "Most consistently funded",
          "Funded epochs / last 8",
        ),
      ],
    }
  }
  if (cardId === "earn-destination") {
    return {
      ...base,
      prompt: "Which destination?",
      options: [
        option(
          "musd-savings",
          "MUSD Savings (sMUSD)",
          "Single-sided · approved route",
        ),
        option(
          "lp-pool",
          "Zap into an LP pool",
          "No approved dual-deposit router",
          "unavailable",
        ),
      ],
    }
  }
  const destination = slots.destination ?? "musd-savings"
  if (cardId === "funding-asset") {
    const amount = slots.amountUsd ?? slots.amount ?? "-"
    return {
      ...base,
      prompt: "Pay with?",
      options: [
        option(
          `MEZO:${destination}:${amount}`,
          "MEZO",
          "Swapped to mUSD on the approved route",
        ),
        option(`MUSD:${destination}:${amount}`, "mUSD", "Deposited directly"),
      ],
    }
  }
  if (cardId === "zap-amount") {
    const funding = slots.fundingAsset ?? "-"
    return {
      ...base,
      prompt: "How much?",
      options: AMOUNT_PRESETS.map((usd) =>
        option(
          `${usd}:${funding}:${destination}`,
          `$${usd}`,
          funding === "-" ? "USD notional" : `Paid in ${funding}`,
        ),
      ),
    }
  }
  if (cardId === "repay-amount") {
    return {
      ...base,
      prompt: "Repay how much?",
      options: [
        option(
          "max",
          "Repay max",
          "Largest partial repay; keeps the minimum debt",
        ),
        option(
          "show",
          "Show my trove",
          "Debt, ratio and liquidation price first",
        ),
      ],
    }
  }
  if (cardId === "voting-domain") {
    return {
      ...base,
      prompt: "Which ballot?",
      options: [
        option("boost", "veMEZO · boost gauges", "BoostVoter"),
        option("validators", "veBTC · validators", "ValidatorsVoter"),
        option("pools", "veBTC · pools & vaults", "PoolsVoter"),
      ],
    }
  }
  return null
}

function decimalOrNull(value: string | undefined): string | null {
  return value && /^\d[\d,]*(?:\.\d{1,18})?$/.test(value) ? value : null
}

/**
 * Resolves an answered card into the next deterministic step, or null when
 * the option is not one this server could have offered.
 */
export function resolveCard(
  cardId: ClarificationCardId,
  optionId: string,
  slots: QuerySlots,
): RouterDecision | null {
  if (cardId === "gauge-objective") {
    if (optionId === "best_personal_return") {
      return {
        kind: "tool",
        intent: "optimize_votes",
        tool: "optimize_votes",
        input: { branch: slots.branch, lockIds: null },
      }
    }
    if (
      optionId === "most_incentives_deposited" ||
      optionId === "most_consistently_funded"
    ) {
      return {
        kind: "tool",
        intent: "rank_gauges",
        tool: "rank_gauges",
        input: {
          objective: optionId,
          branch: slots.branch,
          window:
            optionId === "most_consistently_funded"
              ? (slots.window ?? 8)
              : null,
        },
      }
    }
    return null
  }
  if (cardId === "earn-destination") {
    const destination = DESTINATIONS.find((value) => value === optionId)
    return destination ? zapDecision({ ...slots, destination }) : null
  }
  if (cardId === "funding-asset") {
    const [asset, destination, amount] = optionId.split(":")
    const funding = FUNDING.find((value) => value === asset)
    const dest = DESTINATIONS.find((value) => value === destination)
    if (!funding || !dest) return null
    const parsedAmount = decimalOrNull(amount)
    return zapDecision({
      ...slots,
      fundingAsset: funding,
      destination: dest,
      amountUsd:
        slots.amountUsd ?? (slots.amount === null ? parsedAmount : null),
    })
  }
  if (cardId === "zap-amount") {
    const [usd, funding, destination] = optionId.split(":")
    const dest = DESTINATIONS.find((value) => value === destination)
    if (!usd || !AMOUNT_PRESETS.includes(usd) || !dest) return null
    const asset = FUNDING.find((value) => value === funding) ?? null
    return zapDecision({
      ...slots,
      amountUsd: usd,
      amount: null,
      fundingAsset: asset ?? slots.fundingAsset,
      destination: dest,
    })
  }
  if (cardId === "repay-amount") {
    if (optionId === "max") {
      return {
        kind: "tool",
        intent: "repay",
        tool: "prepare_repay",
        input: { amount: "max" },
      }
    }
    if (optionId === "show") {
      return {
        kind: "tool",
        intent: "loan_position",
        tool: "get_loan_position",
        input: {},
      }
    }
    return null
  }
  if (cardId === "voting-domain") {
    const branch = BRANCHES.find((value) => value === optionId)
    return branch
      ? {
          kind: "tool",
          intent: "optimize_votes",
          tool: "optimize_votes",
          input: { branch, lockIds: null },
        }
      : null
  }
  return null
}
