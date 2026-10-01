import { describe, expect, it } from "vitest"
import { handleApiRequest } from "./index"

describe("worker API", () => {
  it("serves health from the shipped worker handler", async () => {
    const response = await handleApiRequest(
      new Request("http://matchbox-pro.local/api/health"),
    )
    expect(response).toBeTruthy()
    if (!response) throw new Error("expected health response")
    expect(response.status).toBe(200)
    const body = (await response.json()) as { service: string; ok: boolean }
    expect(body.service).toBe("matchbox-pro")
    expect(body.ok).toBe(true)
  })

  it("ignores non-API paths", async () => {
    const response = await handleApiRequest(
      new Request("http://matchbox-pro.local/vote"),
    )
    expect(response).toBeNull()
  })
})
