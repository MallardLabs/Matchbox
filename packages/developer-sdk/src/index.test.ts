import { describe, expect, it, vi } from "vitest"
import { MatchboxApiError, MatchboxClient } from "./index"

describe("MatchboxClient", () => {
  it("sends bearer credentials and parses typed gauge responses", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          data: {
            object: "gauge",
            id: "0x0000000000000000000000000000000000000001",
            chainId: 31612,
            gaugeAddress: "0x0000000000000000000000000000000000000001",
            veBtcTokenId: "42",
            ownerAddress: null,
            profile: null,
            state: {
              isAlive: true,
              bribeAddress: null,
              epochStart: "0",
              rewardTokens: [],
            },
            generatedAt: "2026-06-20T00:00:00.000Z",
          },
        }),
    )
    const client = new MatchboxClient({
      apiKey: "mbx_pk_live_test",
      fetch: fetchMock,
    })
    const gauge = await client.getGaugeByVeBtcToken(42n)
    expect(gauge.veBtcTokenId).toBe("42")
    const requestInit = fetchMock.mock.calls[0]?.[1]
    expect(new Headers(requestInit?.headers).get("Authorization")).toBe(
      "Bearer mbx_pk_live_test",
    )
  })

  it("returns structured API failures", async () => {
    const client = new MatchboxClient({
      apiKey: "bad",
      fetch: async () =>
        Response.json(
          {
            error: {
              code: "invalid-key",
              message: "Invalid key",
              requestId: "req_1",
            },
          },
          { status: 401 },
        ),
    })
    await expect(client.getGauge("0x0")).rejects.toEqual(
      new MatchboxApiError("Invalid key", 401, "invalid-key", "req_1"),
    )
  })
})
