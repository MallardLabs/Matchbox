import { errorBodySchema } from "@repo/platform-contracts/errors"
import {
  currentEpochResponseSchema,
  gaugeDetailSchema,
  gaugeEpochListSchema,
  gaugeListSchema,
  incentiveListSchema,
} from "@repo/platform-contracts/market"
import { describe, expect, it } from "vitest"
import {
  fixtureEpoch,
  fixtureNextEpoch,
  fixturePrices,
  fixtureRead,
  gauges,
} from "./market/fixtures"
import { buildSnapshot } from "./market/snapshot"
import { type TestHarness, createHarness } from "./testing"

async function errorCode(response: Response): Promise<string> {
  return errorBodySchema.parse(await response.json()).error.code
}

async function seededHarness(): Promise<TestHarness> {
  const harness = await createHarness()
  await harness.market.saveSnapshot(
    buildSnapshot(fixtureRead(), fixturePrices, harness.clock.now),
  )
  return harness
}

describe("GET /v1/epochs/current", () => {
  it("describes the current and next epoch", async () => {
    const harness = await createHarness()
    const response = await harness.get("/v1/epochs/current")
    expect(response.status).toBe(200)
    const body = currentEpochResponseSchema.parse(await response.json())
    expect(body.data.current).toEqual({
      start: fixtureEpoch,
      end: fixtureNextEpoch,
      voteStart: fixtureEpoch + 3_600,
      voteEnd: fixtureNextEpoch - 3_600,
      status: "current",
    })
    expect(body.data.next).toMatchObject({
      start: fixtureNextEpoch,
      status: "upcoming",
    })
  })
})

describe("GET /v1/gauges", () => {
  it("lists every gauge with snapshot metadata", async () => {
    const harness = await seededHarness()
    const response = await harness.get("/v1/gauges?network=mezo")
    expect(response.status).toBe(200)
    expect(response.headers.get("ETag")).toMatch(/^W\//)
    const body = gaugeListSchema.parse(await response.json())
    expect(body.data).toHaveLength(5)
    expect(body.meta).toEqual({
      source: "matchbox-market",
      network: "mezo",
      epoch: expect.objectContaining({
        start: fixtureEpoch,
        status: "current",
      }),
      blockNumber: "12000000",
      asOf: "2026-09-30T12:00:00.000Z",
      totalWeights: expect.objectContaining({ boost: expect.any(String) }),
      prices: fixturePrices,
    })
  })

  it("filters by voter, liveness and address", async () => {
    const harness = await seededHarness()
    const byVoter = gaugeListSchema.parse(
      await (await harness.get("/v1/gauges?network=mezo&voter=boost")).json(),
    )
    expect(byVoter.data.map((gauge) => gauge.voter)).toEqual(["boost", "boost"])
    const dead = gaugeListSchema.parse(
      await (await harness.get("/v1/gauges?network=mezo&alive=false")).json(),
    )
    expect(dead.data.map((gauge) => gauge.gaugeAddress)).toEqual([
      gauges.validator,
    ])
    const picked = gaugeListSchema.parse(
      await (
        await harness.get(
          `/v1/gauges?network=mezo&gauge=${gauges.pool.toUpperCase().replace("0X", "0x")}`,
        )
      ).json(),
    )
    expect(picked.data.map((gauge) => gauge.gaugeAddress)).toEqual([
      gauges.pool,
    ])
  })

  it("rejects bad parameters with 400", async () => {
    const harness = await seededHarness()
    for (const path of [
      "/v1/gauges",
      "/v1/gauges?network=mezo&voter=nope",
      "/v1/gauges?network=mezo&alive=yes",
      "/v1/gauges?network=mezo&gauge=0x123",
    ]) {
      const response = await harness.get(path)
      expect(response.status, path).toBe(400)
      expect(await errorCode(response)).toBe("invalid_request")
    }
  })

  it("returns 503 before the first snapshot or without a market database", async () => {
    const empty = await createHarness()
    const response = await empty.get("/v1/gauges?network=mezo-testnet")
    expect(response.status).toBe(503)
    expect(await errorCode(response)).toBe("service_disabled")
    const unbound = await createHarness({ market: null })
    expect((await unbound.get("/v1/gauges?network=mezo")).status).toBe(503)
  })

  it("returns 304 for a matching If-None-Match", async () => {
    const harness = await seededHarness()
    const first = await harness.get("/v1/gauges?network=mezo")
    const etag = first.headers.get("ETag") ?? ""
    const second = await harness.get("/v1/gauges?network=mezo", {
      headers: { "If-None-Match": etag },
    })
    expect(second.status).toBe(304)
  })
})

describe("GET /v1/gauges/{network}/{gaugeAddress}", () => {
  it("returns one gauge", async () => {
    const harness = await seededHarness()
    const response = await harness.get(`/v1/gauges/mezo/${gauges.validator}`)
    expect(response.status).toBe(200)
    const body = gaugeDetailSchema.parse(await response.json())
    expect(body.data).toMatchObject({
      voter: "validators",
      moniker: "Validator One",
    })
  })

  it("404s for unknown or malformed addresses and 403s unknown networks", async () => {
    const harness = await seededHarness()
    expect(
      (await harness.get(`/v1/gauges/mezo/0x${"9".repeat(40)}`)).status,
    ).toBe(404)
    expect((await harness.get("/v1/gauges/mezo/0x12")).status).toBe(404)
    const other = await harness.get(`/v1/gauges/base/${gauges.pool}`)
    expect(other.status).toBe(403)
    expect(await errorCode(other)).toBe("network_not_allowed")
  })
})

describe("GET /v1/gauges/{network}/{gaugeAddress}/epochs", () => {
  it("returns the gauge's epochs newest first", async () => {
    const harness = await seededHarness()
    const response = await harness.get(`/v1/gauges/mezo/${gauges.boost}/epochs`)
    expect(response.status).toBe(200)
    const body = gaugeEpochListSchema.parse(await response.json())
    expect(body.meta).toEqual({
      source: "matchbox-market",
      network: "mezo",
      gaugeAddress: gauges.boost,
    })
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({
      epoch: { start: fixtureEpoch, status: "current" },
      incentives: { gaugeAddress: gauges.boost, aprPercent: "260" },
      totalWeight: "10000000000000000000000",
      blockNumber: "12000000",
    })
  })

  it("validates limit and 404s unseen gauges", async () => {
    const harness = await seededHarness()
    expect(
      (await harness.get(`/v1/gauges/mezo/${gauges.boost}/epochs?limit=0`))
        .status,
    ).toBe(400)
    expect(
      (await harness.get(`/v1/gauges/mezo/0x${"9".repeat(40)}/epochs`)).status,
    ).toBe(404)
  })
})

describe("GET /v1/incentives", () => {
  it("lists rewarded gauges for the current epoch by default", async () => {
    const harness = await seededHarness()
    const response = await harness.get("/v1/incentives?network=mezo")
    expect(response.status).toBe(200)
    const body = incentiveListSchema.parse(await response.json())
    expect(body.data.map((entry) => entry.gaugeAddress)).toEqual([
      gauges.boost,
      gauges.pool,
      gauges.thirdParty,
    ])
    expect(body.meta.epoch.start).toBe(fixtureEpoch)
  })

  it("reads the next epoch and a past epoch by start", async () => {
    const harness = await seededHarness()
    const next = incentiveListSchema.parse(
      await (
        await harness.get("/v1/incentives?network=mezo&epoch=next")
      ).json(),
    )
    expect(next.meta.epoch).toMatchObject({
      start: fixtureNextEpoch,
      status: "upcoming",
    })
    expect(next.data.map((entry) => entry.gaugeAddress)).toEqual([
      gauges.boost,
      gauges.thirdParty,
    ])
    const byStart = incentiveListSchema.parse(
      await (
        await harness.get(
          `/v1/incentives?network=mezo&epoch=${fixtureEpoch}&voter=pools`,
        )
      ).json(),
    )
    expect(byStart.data.map((entry) => entry.voter)).toEqual(["pools"])
  })

  it("404s epochs never captured and 400s malformed ones", async () => {
    const harness = await seededHarness()
    expect(
      (
        await harness.get(
          `/v1/incentives?network=mezo&epoch=${fixtureEpoch - 604_800}`,
        )
      ).status,
    ).toBe(404)
    expect(
      (await harness.get("/v1/incentives?network=mezo&epoch=12345")).status,
    ).toBe(400)
    expect(
      (await harness.get("/v1/incentives?network=mezo&epoch=last")).status,
    ).toBe(400)
  })
})

describe("GET /v1/vebtc/{network}/{tokenId}/gauge", () => {
  it("returns the boost gauge of a veBTC token", async () => {
    const harness = await seededHarness()
    const response = await harness.get("/v1/vebtc/mezo/2/gauge")
    expect(response.status).toBe(200)
    const body = gaugeDetailSchema.parse(await response.json())
    expect(body.data).toMatchObject({
      voter: "boost",
      gaugeAddress: gauges.boost,
      vebtcTokenId: "2",
    })
    expect((await harness.get("/v1/vebtc/mezo/3/gauge")).status).toBe(404)
    expect((await harness.get("/v1/vebtc/mezo/abc/gauge")).status).toBe(404)
  })
})
