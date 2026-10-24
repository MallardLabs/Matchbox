import { buildDiscoveryDocument } from "@repo/platform-contracts/oidc"
import {
  type HealthProbe,
  healthProbeSchema,
} from "@repo/platform-contracts/platform-health"
import { describe, expect, it } from "vitest"
import type { ChainSyncSnapshot } from "../store/api-store"
import { silentLogger } from "../testing"
import runHealthProbes, { type HealthProbeDeps } from "./probes"

const now = new Date("2026-10-21T14:02:10.000Z")
const apiUrl = "https://api.example.test/v1/health"
const idUrl = "https://id.example.test/.well-known/openid-configuration"

const healthy = {
  status: "ok",
  version: "2.0.0",
  flags: { gaugeProfileApi: true },
}
const discovery = buildDiscoveryDocument({
  issuer: "https://id.example.test",
  scopes: ["openid", "wallet"],
})

type Route = () => Response | Promise<Response>

function deps(
  overrides: Partial<HealthProbeDeps> & {
    routes?: Record<string, Route>
    chain?: Partial<Record<string, ChainSyncSnapshot>>
  } = {},
): HealthProbeDeps & { points: { indexes: string[]; blobs: string[] }[] } {
  const routes: Record<string, Route> = {
    [apiUrl]: () => Response.json(healthy),
    [idUrl]: () => Response.json(discovery),
    ...overrides.routes,
  }
  const points: { indexes: string[]; blobs: string[] }[] = []
  return {
    fetch: async (input) => {
      const route = routes[String(input)]
      if (route === undefined) throw new TypeError("fetch failed")
      return route()
    },
    apiHealthUrl: apiUrl,
    idDiscoveryUrl: idUrl,
    async latestChainSync(network) {
      return (
        overrides.chain?.[network] ?? {
          network,
          checkedAt: new Date(now.getTime() - 240_000).toISOString(),
          blockNumber: network === "mezo" ? "4128440" : "2881105",
        }
      )
    },
    async headBlock(network) {
      return network === "mezo" ? 4128500n : null
    },
    deployment: "production",
    now: () => now,
    sink: {
      writeDataPoint(point) {
        points.push(point)
      },
    },
    logger: silentLogger,
    ...overrides,
    points,
  }
}

function byTarget(probes: HealthProbe[], target: string): HealthProbe {
  const probe = probes.find((candidate) => candidate.target === target)
  if (probe === undefined) throw new Error(`missing probe ${target}`)
  return healthProbeSchema.parse(probe)
}

describe("runHealthProbes", () => {
  it("probes the API, Matchbox ID and both networks' chain state", async () => {
    const context = deps()
    const probes = await runHealthProbes(context)
    expect(probes.map((probe) => probe.target).sort()).toEqual([
      "chain-sync:mezo",
      "chain-sync:mezo-testnet",
      "gauge-profile-api",
      "matchbox-id",
    ])
    expect(byTarget(probes, "gauge-profile-api")).toMatchObject({
      outcome: "up",
      errorCode: null,
      version: "2.0.0",
      httpStatus: 200,
      deployment: "production",
    })
    expect(byTarget(probes, "matchbox-id")).toMatchObject({
      outcome: "up",
      httpStatus: 200,
    })
    expect(byTarget(probes, "chain-sync:mezo")).toMatchObject({
      outcome: "up",
      network: "mezo",
      blockNumber: "4128440",
      headBlock: "4128500",
      lagSeconds: 240,
      blocksBehind: 60,
    })
    expect(byTarget(probes, "chain-sync:mezo-testnet")).toMatchObject({
      headBlock: null,
      blocksBehind: -1,
    })
    expect(context.points).toHaveLength(4)
    expect(
      context.points.every((point) => point.blobs[0] === "production"),
    ).toBe(true)
  })

  it("records the kill switch, bad bodies, HTTP errors and timeouts as down", async () => {
    const disabled = await runHealthProbes(
      deps({
        routes: {
          [apiUrl]: () =>
            Response.json({ ...healthy, flags: { gaugeProfileApi: false } }),
          [idUrl]: () => Response.json({ issuer: "nope" }),
        },
      }),
    )
    expect(byTarget(disabled, "gauge-profile-api")).toMatchObject({
      outcome: "down",
      errorCode: "service-disabled",
      version: "2.0.0",
    })
    expect(byTarget(disabled, "matchbox-id")).toMatchObject({
      outcome: "down",
      errorCode: "invalid-body",
    })

    const failing = await runHealthProbes(
      deps({
        routes: {
          [apiUrl]: () => new Response("upstream", { status: 502 }),
          [idUrl]: () => {
            throw new DOMException("timed out", "TimeoutError")
          },
        },
      }),
    )
    expect(byTarget(failing, "gauge-profile-api")).toMatchObject({
      outcome: "down",
      errorCode: "http-error",
      httpStatus: 502,
    })
    expect(byTarget(failing, "matchbox-id")).toMatchObject({
      outcome: "down",
      errorCode: "timeout",
      httpStatus: 0,
    })
  })

  it("maps a 503 service_disabled body to service-disabled", async () => {
    const probes = await runHealthProbes(
      deps({
        routes: {
          [idUrl]: () =>
            Response.json(
              {
                error: {
                  code: "service_disabled",
                  message: "Disabled.",
                  requestId: "req_000000000000000000000000",
                  docsUrl: "https://developer.matchbox.markets/docs/errors",
                },
              },
              { status: 503 },
            ),
        },
      }),
    )
    expect(byTarget(probes, "matchbox-id")).toMatchObject({
      outcome: "down",
      errorCode: "service-disabled",
      httpStatus: 503,
    })
  })

  it("grades stale or missing chain state", async () => {
    const probes = await runHealthProbes(
      deps({
        chain: {
          mezo: {
            network: "mezo",
            checkedAt: new Date(now.getTime() - 30 * 60_000).toISOString(),
            blockNumber: "4128000",
          },
          "mezo-testnet": {
            network: "mezo-testnet",
            checkedAt: null,
            blockNumber: null,
          },
        },
      }),
    )
    expect(byTarget(probes, "chain-sync:mezo")).toMatchObject({
      outcome: "degraded",
      errorCode: "stale",
      lagSeconds: 1800,
    })
    expect(byTarget(probes, "chain-sync:mezo-testnet")).toMatchObject({
      outcome: "down",
      errorCode: "no-data",
      lagSeconds: -1,
      blockNumber: null,
    })
  })

  it("skips unconfigured URLs and unreadable chain state", async () => {
    const context = deps({
      apiHealthUrl: null,
      idDiscoveryUrl: null,
      async latestChainSync() {
        throw new Error("database unavailable")
      },
    })
    expect(await runHealthProbes(context)).toEqual([])
    expect(context.points).toEqual([])
  })

  it("keeps probing when the RPC head is unavailable", async () => {
    const probes = await runHealthProbes(
      deps({
        async headBlock() {
          throw new Error("rpc down")
        },
      }),
    )
    expect(byTarget(probes, "chain-sync:mezo")).toMatchObject({
      outcome: "up",
      errorCode: "rpc-unavailable",
      headBlock: null,
    })
  })
})
