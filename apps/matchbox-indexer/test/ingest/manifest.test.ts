import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse } from "yaml"
import { STATIC_CONTRACTS } from "../../src/ingest/static-contracts"
import type { ContractKind } from "../../src/ingest/store"
import { FILTER_GROUPS, HANDLED_EVENTS } from "../../src/ingest/topics"

// The explorer subgraph is the reference for what ingest must cover. These
// tests fail when its manifest and the ingest config drift apart.

const subgraphDir = fileURLToPath(
  new URL("../../../activity-subgraph/", import.meta.url),
)

type Handler = { event: string }
type Source = {
  name: string
  source: { address?: string; abi: string }
  mapping: { eventHandlers: Handler[] }
}

const manifest = parse(
  readFileSync(resolve(subgraphDir, "subgraph.yaml"), "utf8"),
) as { dataSources: Source[]; templates: Source[] }

function canonical(event: string): string {
  return event.replace(/indexed\s+/g, "").replace(/\s+/g, "")
}

const TEMPLATE_KINDS: Record<string, ContractKind> = {
  Gauge: "gauge",
  BribeVotingReward: "bribeVotingReward",
  FeeVotingReward: "feeVotingReward",
  Pool: "pool",
}

describe("static contracts", () => {
  const statics = new Map(
    STATIC_CONTRACTS.mezo.map((contract) => [contract.template, contract]),
  )

  it("lists every explorer data source at its address", () => {
    expect(statics.size).toBe(manifest.dataSources.length)
    for (const source of manifest.dataSources) {
      expect(statics.get(source.name)?.address).toBe(
        source.source.address?.toLowerCase(),
      )
    }
  })

  it("links each Legacy* reward contract to the pool and gauge on record", () => {
    const legacy = readFileSync(
      resolve(subgraphDir, "src/legacy-pool-rewards.ts"),
      "utf8",
    )
    const triples = [
      ...legacy.matchAll(
        /\[\s*"(0x[0-9a-f]{40})",\s*"(0x[0-9a-f]{40})",\s*"(0x[0-9a-f]{40})",?\s*\]/g,
      ),
    ]
    expect(triples).toHaveLength(18)
    const byAddress = new Map(
      STATIC_CONTRACTS.mezo.map((contract) => [contract.address, contract]),
    )
    for (const [, reward, pool, gauge] of triples) {
      expect(byAddress.get(reward as `0x${string}`)).toMatchObject({
        pool,
        gauge,
      })
    }
  })
})

describe("handled topics", () => {
  it("covers every data source handler for its kind", () => {
    const statics = new Map(
      STATIC_CONTRACTS.mezo.map((contract) => [
        contract.template,
        contract.kind,
      ]),
    )
    for (const source of manifest.dataSources) {
      const kind = statics.get(source.name) as ContractKind
      expect(
        [...HANDLED_EVENTS[kind]].sort(),
        `${source.name} (${kind})`,
      ).toEqual(
        source.mapping.eventHandlers
          .map((handler) => canonical(handler.event))
          .sort(),
      )
    }
  })

  it("covers every template handler for its kind", () => {
    for (const template of manifest.templates) {
      const kind = TEMPLATE_KINDS[template.name] as ContractKind
      expect(kind, template.name).toBeDefined()
      expect([...HANDLED_EVENTS[kind]].sort(), template.name).toEqual(
        template.mapping.eventHandlers
          .map((handler) => canonical(handler.event))
          .sort(),
      )
    }
  })

  it("puts every kind in exactly one filter group", () => {
    const grouped = FILTER_GROUPS.flat()
    expect(new Set(grouped).size).toBe(grouped.length)
    expect([...grouped].sort()).toEqual(
      (Object.keys(HANDLED_EVENTS) as ContractKind[]).sort(),
    )
  })
})
