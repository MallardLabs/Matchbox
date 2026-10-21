import { describe, expect, it } from "vitest"
import { earningsSchema, envelopeSchema } from "../../features/history/schema"
import { createApiHandler } from "../router"
import { historyRoutes } from "../routes/history"

// Request validation and the testnet (no history) path; no network access.
const handle = createApiHandler(historyRoutes)
const WALLET = "0xf36593cd2e5eb2cc8ccbe5ad3b5bb2353cf98bc4"

async function call(path: string): Promise<Response> {
  const response = await handle(new Request(`http://pro.local${path}`))
  if (!response) throw new Error(`no route for ${path}`)
  return response
}

describe("history routes", () => {
  it("rejects bad input with a code and no internals", async () => {
    const cases: Array<[string, string]> = [
      ["/api/wallets/0xnope/earnings", "invalid_address"],
      [`/api/wallets/${WALLET}/earnings?epochs=99`, "invalid_request"],
      [`/api/wallets/${WALLET}/earnings?network=base`, "unsupported_network"],
      [`/api/wallets/${WALLET}/ledger?status=paid`, "invalid_request"],
      [`/api/wallets/${WALLET}/activity?kinds=bogus`, "invalid_request"],
      ["/api/activity/tx/0x1234", "invalid_request"],
    ]
    for (const [path, code] of cases) {
      const response = await call(path)
      expect(response.status, path).toBe(400)
      expect(await response.json()).toMatchObject({ error: code })
    }
  })

  it("answers testnet with an explicit unavailable state", async () => {
    const response = await call(
      `/api/wallets/${WALLET}/earnings?network=mezo-testnet`,
    )
    expect(response.status).toBe(200)
    const body = envelopeSchema(earningsSchema).parse(await response.json())
    expect(body.freshness.state).toBe("unavailable")
    expect(body.data.epochs).toEqual([])
  })

  it("serves the ledger CSV as an attachment", async () => {
    const response = await call(
      `/api/wallets/${WALLET}/ledger.csv?network=mezo-testnet`,
    )
    expect(response.headers.get("content-type")).toContain("text/csv")
    expect(response.headers.get("content-disposition")).toContain("attachment")
    expect((await response.text()).startsWith("epoch_start,")).toBe(true)
  })
})
