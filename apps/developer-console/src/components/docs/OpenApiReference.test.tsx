import openapi from "@repo/platform-contracts/openapi.json"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  endpointAnchor,
  exampleValue,
  groupEndpoints,
  httpMethods,
  parseOpenApi,
} from "../../lib/openapi"
import OpenApiReference from "./OpenApiReference"

const document = parseOpenApi(openapi)

const operations = Object.entries(document.paths).flatMap(([path, item]) =>
  httpMethods
    .filter((method) => item[method] !== undefined)
    .map((method) => ({ method, path })),
)

describe("OpenApiReference", () => {
  it("renders every path and method from the real openapi.json", () => {
    expect(operations.length).toBeGreaterThan(0)
    const { container } = render(
      <OpenApiReference document={document} network="mezo-testnet" />,
    )
    const index = screen.getByRole("navigation", { name: "Endpoints" })
    for (const { method, path } of operations) {
      const id = endpointAnchor(method, path)
      const section = container.querySelector(`section[id="${id}"]`)
      expect(section, `${method} ${path}`).not.toBeNull()
      if (section instanceof HTMLElement) {
        expect(within(section).getAllByText(path).length).toBeGreaterThan(0)
      }
      expect(index.querySelector(`a[href="#${id}"]`)).toHaveTextContent(path)
    }
  })

  it("groups by tag and documents parameters, statuses and examples", () => {
    const groups = groupEndpoints(document)
    expect(groups.map((group) => group.tag)).toEqual(
      document.tags.map((tag) => tag.name),
    )
    render(<OpenApiReference document={document} network="mezo" />)
    expect(screen.getAllByText("network").length).toBeGreaterThan(0)
    expect(screen.getAllByText("429").length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/gaugeProfiles\.list\(\{ network: "mezo"/).length,
    ).toBeGreaterThan(0)
  })

  it("builds examples from schema fields", () => {
    const list = document.components.schemas.GaugeProfileList
    expect(list).toBeDefined()
    const example = exampleValue(list ?? {}, document)
    expect(example).toMatchObject({ data: [expect.any(Object)] })
  })
})
