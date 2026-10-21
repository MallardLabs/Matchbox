import { z } from "zod"
import type { Fact } from "../../../features/query/contract"
import { displayUsd, microFromUsd6, usd6 } from "../format"
import { type ToolOutcome, makeEvidence, makeFact, traceItem } from "../outcome"
import {
  ZERO_WALLET,
  errorOutcome,
  plainOutcome,
  sourceCluster,
} from "./common"
import { defineTool } from "./tool"

export const searchTransactionsTool = defineTool({
  name: "search_transactions",
  family: "activity",
  description:
    "Bridge journeys for the selected wallet that a provider explicitly links to Mezo (Wormhole today). Use for 'wormhole transactions', 'bridge history', 'portal transfers'.",
  input: z.object({
    provider: z.enum(["wormhole", "all"]),
    direction: z.enum(["in", "out"]).nullable(),
    limit: z.number().int().min(1).max(50).nullable(),
  }),
  async run(context, input) {
    const { scope, wallet } = context
    const tool = "search_transactions"
    if (wallet.address === ZERO_WALLET) {
      return plainOutcome({
        scope,
        tool,
        intent: "bridge_search",
        status: "empty",
        title: "Bridge transactions",
        templateId: `${tool}.no_wallet.v1`,
        text: "Connect or watch a wallet to search its bridge activity.",
        kind: "empty",
        traceLabel: "No wallet selected",
      })
    }
    try {
      const result = await context.providers.bridge(
        wallet.address,
        input.limit ?? 25,
        input.direction,
      )
      const evidence = [
        makeEvidence({
          scope,
          key: "wormhole",
          kind: "provider",
          label: "Wormholescan · live",
          source: "Wormholescan operations API",
          url: result.sourceUrl,
          fetchedAt: result.fetchedAt,
          status: "live",
        }),
      ]
      const refs = evidence.map((item) => item.id)
      const priced = result.records.filter((record) => record.usdValue !== null)
      const total = priced.reduce(
        (sum, record) => sum + microFromUsd6(record.usdValue ?? "0.000000"),
        0n,
      )
      const count = makeFact({
        scope,
        key: "count",
        label: "Bridge transfers",
        value: { kind: "count", count: result.records.length },
        display: `${result.records.length}`,
        status: "live",
        evidenceRefs: refs,
      })
      const facts: Fact[] = [count]
      let text = `${count.display} Mezo-linked Wormhole transfers.`
      if (priced.length > 0) {
        const totalFact = makeFact({
          scope,
          key: "total",
          label: "Bridged value",
          value: { kind: "usd", usd: usd6(total) },
          display: displayUsd(total),
          status: "historical",
          evidenceRefs: refs,
        })
        facts.push(totalFact)
        text = `${count.display} Mezo-linked Wormhole transfers, ${totalFact.display} in total.`
      }
      if (result.records.length === 0) {
        text = "No Mezo-linked Wormhole transfers for this wallet."
      }
      return {
        tool,
        intent: "bridge_search",
        status: result.records.length ? "ok" : "empty",
        title: "Bridge transactions",
        snapshot: {
          blockNumber: null,
          epoch: null,
          label: "Wormholescan · live",
        },
        answer: {
          kind: result.records.length ? "result" : "empty",
          templateId: `${tool}.lead.v1`,
          text,
          factRefs: result.records.length ? facts.map((fact) => fact.id) : [],
        },
        why: null,
        facts,
        evidence,
        blocks: [
          {
            type: "bridge_records",
            version: 1,
            id: scope.id("b.records"),
            evidenceRefs: refs,
            records: result.records,
            providerFilter: input.provider === "wormhole" ? "Wormhole" : null,
            totalUsd: priced.length ? usd6(total) : null,
          },
          sourceCluster(scope, evidence),
        ],
        proposals: [],
        followups: [],
        trace: [
          traceItem({
            scope,
            key: "search",
            label: `Read ${result.records.length} Wormhole operations`,
            tool,
          }),
        ],
        model: {
          rows: result.records.slice(0, 10).map((record) => ({
            direction: record.direction,
            route: `${record.sourceChain} → ${record.destinationChain}`,
            symbol: record.sourceAsset,
            amount: record.sourceAmount,
            usd:
              record.usdValue === null
                ? null
                : displayUsd(microFromUsd6(record.usdValue)),
            status: record.status,
          })),
          notes: [],
        },
        surface: result.records.length > 5 ? "canvas" : "rail",
      } satisfies ToolOutcome
    } catch {
      return errorOutcome({
        scope,
        tool,
        intent: "bridge_search",
        title: "Bridge transactions",
      })
    }
  },
})
