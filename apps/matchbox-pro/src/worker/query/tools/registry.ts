import { searchTransactionsTool } from "./activity"
import { resolveEntityTool, walletContextTool } from "./entity"
import {
  claimSurplusTool,
  getLoanPositionTool,
  prepareRepayTool,
  scenarioLiquidationTool,
} from "./loans"
import { listClaimableTool, prepareClaimTool } from "./rewards"
import { draftSupportReportTool } from "./support"
import type { RegisteredTool } from "./tool"
import { optimizeVotesTool, prepareVoteTool, rankGaugesTool } from "./votes"
import { prepareZapTool, quoteZapTool } from "./zap"

// Deterministic order: the tool list renders first in every Claude request
// and is part of the cached prefix.
export const STUART_TOOLS: readonly RegisteredTool[] = [
  resolveEntityTool,
  walletContextTool,
  rankGaugesTool,
  optimizeVotesTool,
  prepareVoteTool,
  listClaimableTool,
  prepareClaimTool,
  getLoanPositionTool,
  scenarioLiquidationTool,
  prepareRepayTool,
  claimSurplusTool,
  quoteZapTool,
  prepareZapTool,
  searchTransactionsTool,
  draftSupportReportTool,
]

const BY_NAME = new Map(STUART_TOOLS.map((tool) => [tool.name, tool]))

export function toolByName(name: string): RegisteredTool | null {
  return BY_NAME.get(name) ?? null
}
