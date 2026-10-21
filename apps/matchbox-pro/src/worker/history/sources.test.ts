import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("./chain", () => ({
  mezoHistoryClient: () => ({
    getBlockNumber: async () => 12_656_982n,
  }),
}))

const { encodeCursor } = await import("./http")
const {
  pgArray,
  queryBatch,
  queryBatchCached,
  quantiseNow,
  sqlEndpoint,
  WarehouseUnavailableError,
  warehouseBreakerOpen,
  warehouseCacheKey,
} = await import("./neon")
const { clearHistoryMemo } = await import("./store")
const {
  activityFreshness,
  buildWarehouseActivityQuery,
  freshnessFrom,
  queryActivity,
  queryTx,
  sourceConfig,
} = await import("./sources")

afterEach(() => {
  clearHistoryMemo()
})

const WALLET = "0xf36593cd2e5eb2cc8ccbe5ad3b5bb2353cf98bc4"
const BASE_QUERY = {
  wallet: WALLET,
  actionTypes: [],
  gauge: undefined,
  source: undefined,
  from: 0,
  to: 1_800_000_000,
  limit: 2,
  cursor: null,
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  })
}

describe("source config", () => {
  it("switches to the warehouse when MATCHBOX_WAREHOUSE_URL is set", () => {
    expect(sourceConfig({}).warehouseUrl).toBeUndefined()
    expect(
      sourceConfig({ MATCHBOX_WAREHOUSE_URL: " " }).warehouseUrl,
    ).toBeUndefined()
    expect(sourceConfig({}).explorerOrigin).toBe("https://app.matchbox.markets")
    expect(
      sourceConfig({ MATCHBOX_WAREHOUSE_URL: "postgres://b" }).warehouseUrl,
    ).toBe("postgres://b")
  })
})

describe("warehouse SQL", () => {
  it("scopes a wallet to actor, recipient, pokes and its locks' votes", () => {
    const query = buildWarehouseActivityQuery({
      ...BASE_QUERY,
      actionTypes: ["BOOST_VOTE"],
    })
    expect(query.text).toContain("a.actor = $4 OR a.recipient = $4")
    expect(query.text).toContain(
      "a.action_type = 'BOOST_POKE' AND a.tx_from = $4",
    )
    expect(query.text).toContain("matchbox.lock_positions")
    expect(query.text).toContain('a.id COLLATE "C" DESC')
    expect(query.params[0]).toBe("mezo")
    expect(query.params).toContain(WALLET)
    expect(query.params).toContainEqual(["BOOST_VOTE"])
    expect(query.params.at(-1)).toBe(3)
  })

  it("continues after the cursor row", () => {
    const cursor = encodeCursor({
      t: "1790000000",
      b: "12000000",
      l: 3,
      id: "x",
    })
    const query = buildWarehouseActivityQuery({ ...BASE_QUERY, cursor })
    expect(query.text).toContain(
      '(a.timestamp, a.block_number, a.log_index, a.id COLLATE "C") <',
    )
    expect(query.params).toEqual(
      expect.arrayContaining(["1790000000", "12000000", 3, "x"]),
    )
  })

  it("rejects a malformed cursor", () => {
    expect(() =>
      buildWarehouseActivityQuery({ ...BASE_QUERY, cursor: "not-a-cursor" }),
    ).toThrow()
  })
})

describe("neon HTTP", () => {
  it("posts a read-only batch and maps array rows to objects", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          queries: Array<{ params: unknown[] }>
        }
        expect(body.queries[0]?.params).toEqual(["mezo", '{"A","B\\"C"}', null])
        return jsonResponse({
          results: [
            {
              fields: [{ name: "id" }, { name: "n" }],
              rows: [
                ["a", "1"],
                ["b", null],
              ],
            },
          ],
        })
      },
    )
    const rows = await queryBatch(
      "postgres://u:p@ep-x-pooler.us-east-2.aws.neon.tech/db",
      [{ text: "SELECT 1", params: ["mezo", ["A", 'B"C'], undefined] }],
      fetcher as unknown as typeof fetch,
    )
    expect(rows).toEqual([
      [
        { id: "a", n: "1" },
        { id: "b", n: null },
      ],
    ])
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(url).toBe("https://api.us-east-2.aws.neon.tech/sql")
    expect(new Headers(init?.headers).get("Neon-Batch-Read-Only")).toBe("true")
  })

  it("builds the endpoint and array literals like the driver", () => {
    expect(
      sqlEndpoint("postgres://u:p@ep-a.eu-central-1.aws.neon.tech/db"),
    ).toBe("https://api.eu-central-1.aws.neon.tech/sql")
    expect(pgArray([])).toBe("{}")
  })
})

describe("freshness", () => {
  it("is stale for the frozen explorer and fresh for a caught-up index", () => {
    const now = 1_792_562_000
    expect(
      freshnessFrom({
        source: "frozen-explorer",
        indexedBlock: 12_075_331n,
        indexedAt: 1_790_284_448,
        head: 12_656_982n,
        now,
        frozen: true,
      }),
    ).toMatchObject({ state: "stale", lagBlocks: "581651" })
    expect(
      freshnessFrom({
        source: "warehouse",
        indexedBlock: 12_656_970n,
        indexedAt: now - 30,
        head: 12_656_982n,
        now,
        frozen: false,
      }),
    ).toMatchObject({ state: "fresh", lagBlocks: "12", lagSeconds: 46 })
  })
})

describe("queryActivity", () => {
  it("reads the warehouse when configured and pages by keyset cursor", async () => {
    const row = (id: string, logIndex: string) => ({
      id,
      action_type: "BOOST_POKE",
      source: "BOOST_VOTER",
      tx_hash: `0x${"ab".repeat(32)}`,
      tx_from: WALLET,
      log_index: logIndex,
      block_number: "12000000",
      timestamp: "1790000000",
      boostable_token_id: "5",
      boost: "2000000000000000000",
    })
    const fetcher = vi.fn(async () =>
      jsonResponse({
        results: [
          {
            fields: Object.keys(row("a", "1")).map((name) => ({ name })),
            rows: [row("a", "3"), row("b", "2"), row("c", "1")].map(
              Object.values,
            ),
          },
          {
            fields: [{ name: "last_block" }, { name: "updated_at" }],
            rows: [["12656970", String(Math.floor(Date.now() / 1000) - 20)]],
          },
        ],
      }),
    )
    const result = await queryActivity(
      {
        warehouseUrl: "postgres://u:p@ep-x.aws.neon.tech/db",
        explorerOrigin: "",
      },
      BASE_QUERY,
      fetcher as unknown as typeof fetch,
    )
    expect(result.items.map((item) => item.kind)).toEqual([
      "boost_refreshed",
      "boost_refreshed",
    ])
    expect(result.nextCursor).not.toBeNull()
    expect(result.freshness).toMatchObject({
      source: "warehouse",
      state: "fresh",
    })
  })

  it("is unavailable only when the warehouse and explorer are both down", async () => {
    const fetcher = vi.fn(async () => new Response("down", { status: 500 }))
    await expect(
      queryActivity(
        {
          warehouseUrl: "postgres://u:p@ep-x.aws.neon.tech/db",
          explorerOrigin: "",
        },
        BASE_QUERY,
        fetcher as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ status: 503, code: "warehouse_unavailable" })
  })

  it("falls back to the frozen explorer and reports it stale", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      // The freshness probe asks for non-vote action types only.
      const probe = url.searchParams.has("actionTypes")
      return jsonResponse({
        success: true,
        page: 0,
        hasMore: !probe,
        data: [
          {
            id: "row",
            blockNumber: "12075331",
            timestamp: 1790284448,
            actionType: "lockCreated",
            boostContext: "unknown",
            source: "subgraph",
            contract: "votingEscrow",
            txHash: `0x${"ef".repeat(32)}`,
            actorAddress: WALLET,
            tokenId: "9",
            logIndex: 0,
          },
        ],
      })
    })
    const result = await queryActivity(
      { warehouseUrl: undefined, explorerOrigin: "https://explorer.test" },
      { ...BASE_QUERY, wallet: WALLET, limit: 1 },
      fetcher as unknown as typeof fetch,
    )
    expect(result.items[0]?.kind).toBe("lock_created")
    expect(result.freshness).toMatchObject({
      source: "frozen-explorer",
      state: "stale",
      indexedThroughBlock: "12075331",
    })
    expect(result.nextCursor).not.toBeNull()
    const firstUrl = new URL(String(fetcher.mock.calls[0]?.[0]))
    expect(firstUrl.searchParams.get("actor")).toBe(WALLET)
  })

  it("ends explorer paging on a short page even when it says hasMore", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ success: true, page: 5, hasMore: true, data: [] }),
    )
    const result = await queryActivity(
      { warehouseUrl: undefined, explorerOrigin: "https://short.test" },
      { ...BASE_QUERY, limit: 200 },
      fetcher as unknown as typeof fetch,
    )
    expect(result.items).toEqual([])
    expect(result.nextCursor).toBeNull()
    // The explorer still had rows in range: flagged, not silently dropped.
    expect(result.truncated).toBe(true)
  })
})

describe("warehouse read cache", () => {
  const url = "postgres://u:p@ep-x.aws.neon.tech/db"
  const query = { text: "SELECT 1", params: ["mezo", 1_792_000_200] }
  const answer = () =>
    jsonResponse({ results: [{ fields: [{ name: "n" }], rows: [["1"]] }] })

  it("serves repeats from cache for 300 s, then reads again", async () => {
    let now = 1_000_000
    const fetcher = vi.fn(async () => answer())
    const read = () =>
      queryBatchCached(
        url,
        [query],
        fetcher as unknown as typeof fetch,
        () => now,
      )
    expect(await read()).toEqual([[{ n: "1" }]])
    now += 299_000
    await read()
    expect(fetcher).toHaveBeenCalledTimes(1)
    clearHistoryMemo()
    now += 2_000
    await read()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("never caches a failed read; the breaker skips Neon for a while", async () => {
    const down = vi.fn(async () => new Response("down", { status: 500 }))
    await expect(
      queryBatchCached(url, [query], down as unknown as typeof fetch),
    ).rejects.toThrow()
    expect(warehouseBreakerOpen()).toBe(true)
    // While open, Neon isn't asked at all.
    const up = vi.fn(async () => answer())
    await expect(
      queryBatchCached(url, [query], up as unknown as typeof fetch),
    ).rejects.toThrow()
    expect(up).not.toHaveBeenCalled()
    // Breaker closed again (120 s later): the read goes through.
    clearHistoryMemo()
    expect(
      await queryBatchCached(url, [query], up as unknown as typeof fetch),
    ).toEqual([[{ n: "1" }]])
    expect(up).toHaveBeenCalledTimes(1)
  })

  it("treats a slow warehouse as unavailable", async () => {
    const hang = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          )
        }),
    )
    await expect(
      queryBatch(url, [query], hang as unknown as typeof fetch, 20),
    ).rejects.toBeInstanceOf(WarehouseUnavailableError)
  })

  it("keys by query and params, not credentials", async () => {
    const a = await warehouseCacheKey(url, [query])
    const b = await warehouseCacheKey(
      "postgres://other:secret@ep-x.aws.neon.tech/db",
      [query],
    )
    const c = await warehouseCacheKey(url, [{ ...query, params: ["mezo", 2] }])
    expect(a).toMatch(/^warehouse:[0-9a-f]{64}$/)
    expect(b).toBe(a)
    expect(c).not.toBe(a)
  })

  it("quantises open-ended windows to the next 300 s boundary", () => {
    expect(quantiseNow(1_792_000_001)).toBe(1_792_000_200)
    expect(quantiseNow(1_792_000_200)).toBe(1_792_000_200)
  })
})

describe("freshness with 15-minute indexer ticks", () => {
  const now = 1_792_562_000
  const fresh = (lagSeconds: number, lagBlocks: bigint) =>
    freshnessFrom({
      source: "warehouse",
      indexedBlock: 12_656_982n - lagBlocks,
      indexedAt: now - lagSeconds,
      head: 12_656_982n,
      now,
      frozen: false,
    }).state

  it("is fresh through a normal tick plus cache (~20 min)", () => {
    expect(fresh(1_200, 312n)).toBe("fresh")
  })

  it("is stale after a missed tick (45 min / ~700 blocks)", () => {
    expect(fresh(2_800, 300n)).toBe("stale")
    expect(fresh(600, 710n)).toBe("stale")
  })
})

describe("warehouse fallback", () => {
  const config = {
    warehouseUrl: "postgres://u:p@ep-x.aws.neon.tech/db",
    explorerOrigin: "https://explorer.test",
  }
  const EXPLORER_ROWS = [
    { id: "new", timestamp: 1_790_000_300 },
    { id: "old", timestamp: 1_790_000_100 },
  ]

  /** Neon answers 500 (quota spent); the explorer serves two rows. */
  function stub(): {
    fetcher: typeof fetch
    neonCalls: () => number
    explorerUrls: () => URL[]
  } {
    let neon = 0
    const urls: URL[] = []
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.host.endsWith("neon.tech")) {
        neon += 1
        return new Response("quota exceeded", { status: 500 })
      }
      urls.push(url)
      return jsonResponse({
        success: true,
        page: 0,
        hasMore: false,
        data: EXPLORER_ROWS.map((row, index) => ({
          ...row,
          blockNumber: "12000000",
          actionType: "lockCreated",
          boostContext: "unknown",
          source: "subgraph",
          contract: "votingEscrow",
          txHash: `0x${String(index).repeat(64)}`,
          actorAddress: WALLET,
          logIndex: 0,
        })),
      })
    })
    return {
      fetcher: fetcher as unknown as typeof fetch,
      neonCalls: () => neon,
      explorerUrls: () => urls,
    }
  }

  it("serves the explorer, marked stale, and stops asking Neon", async () => {
    const { fetcher, neonCalls } = stub()
    const first = await queryActivity(config, BASE_QUERY, fetcher)
    expect(first.items.map((item) => item.id)).toEqual(["new", "old"])
    expect(first.freshness).toMatchObject({
      source: "frozen-explorer",
      state: "stale",
    })
    await queryActivity(config, { ...BASE_QUERY, limit: 3 }, fetcher)
    expect(neonCalls()).toBe(1)
  })

  it("continues a warehouse-started list past its last row", async () => {
    const { fetcher, explorerUrls } = stub()
    const cursor = encodeCursor({
      t: "1790000200",
      b: "12000000",
      l: 0,
      id: "x",
    })
    const result = await queryActivity(
      config,
      { ...BASE_QUERY, cursor },
      fetcher,
    )
    expect(result.items.map((item) => item.id)).toEqual(["old"])
    const listUrl = explorerUrls().find((url) => url.searchParams.has("actor"))
    expect(listUrl?.searchParams.get("to")).toBe("1790000200")
  })

  it("falls back for freshness and tx permalinks too", async () => {
    const { fetcher } = stub()
    expect((await activityFreshness(config, fetcher)).source).toBe(
      "frozen-explorer",
    )
    const tx = await queryTx(config, `0x${"ab".repeat(32)}`, fetcher)
    expect(tx.freshness.source).toBe("frozen-explorer")
  })
})
