import openapi from "@repo/platform-contracts/openapi.json"
import { describe, expect, it } from "vitest"
import { buildDocsIndex, searchDocs } from "./docs-search"
import { groupEndpoints, parseOpenApi } from "./openapi"

const index = buildDocsIndex(groupEndpoints(parseOpenApi(openapi)))

describe("searchDocs", () => {
  it("lists guides, not endpoints, for an empty query", () => {
    const results = searchDocs(index, "  ")
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((entry) => entry.method === null)).toBe(true)
    expect(results[0]?.title).toBe("Quickstart")
  })

  it("matches guide keywords and ranks title matches first", () => {
    expect(searchDocs(index, "rate")[0]?.title).toBe("Rate limits")
    expect(searchDocs(index, "pkce")[0]?.target).toEqual({
      kind: "guide",
      page: "oidc",
    })
  })

  it("requires every term and finds endpoints by path and method", () => {
    const results = searchDocs(index, "get gauge-profiles")
    expect(results.length).toBeGreaterThan(0)
    expect(
      results.every(
        (entry) =>
          entry.method === "GET" && entry.title.includes("gauge-profiles"),
      ),
    ).toBe(true)
    expect(results[0]?.target).toMatchObject({ kind: "reference" })
    expect(searchDocs(index, "gauge zzzz")).toEqual([])
  })

  it("caps the result count", () => {
    expect(searchDocs(index, "e", 3)).toHaveLength(3)
  })
})
