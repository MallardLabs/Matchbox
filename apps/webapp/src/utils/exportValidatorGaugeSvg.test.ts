import assert from "node:assert/strict"
import test from "node:test"
import {
  buildValidatorGaugeSvg,
  escapeXml,
  exportFilename,
} from "./exportValidatorGaugeSvg"

const colors = {
  surface: "#161616",
  surfaceSecondary: "#1e1e1e",
  border: "#2a2a2a",
  contentPrimary: "#fafaf9",
  contentSecondary: "#a8a29e",
  contentTertiary: "#a8a29e",
}

test("escapes XML so names cannot break the SVG", () => {
  assert.equal(
    escapeXml(`A&B <C> "D" 'E'`),
    "A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;",
  )
})

test("builds a native SVG without HTML foreignObject", () => {
  const svg = buildValidatorGaugeSvg({
    displayName: "ACME Validator",
    description: "Stakes BTC for the network.",
    avatarDataUrl: null,
    avatarInitials: "AC",
    weightLabel: "12.34 veBTC",
    apyLabel: "8.20%",
    incentivesLabel: "~$1,234.56",
    tokens: [{ symbol: "BTC", iconDataUrl: null }],
    colors,
  })

  assert.match(svg, /^<\?xml version="1.0" encoding="UTF-8"\?>/)
  assert.doesNotMatch(svg, /foreignObject/i)
  assert.match(svg, /ACME Validator/)
  assert.match(svg, /12.34 veBTC/)
  assert.match(svg, /8.20%/)
  assert.match(svg, /~\$1,234.56/)
  assert.match(svg, />BTC</)
  assert.match(svg, /font-size="18"/)
  assert.match(svg, /width="320"/)
  assert.match(svg, /height="236"/)
})

test("centers a nameless-description card and slugs the filename", () => {
  const svg = buildValidatorGaugeSvg({
    displayName: "Solo Node",
    description: null,
    avatarDataUrl: null,
    avatarInitials: "SO",
    weightLabel: "1 veBTC",
    apyLabel: "—",
    incentivesLabel: "~$0.00",
    tokens: [],
    colors,
  })

  assert.doesNotMatch(svg, /Stakes BTC/)
  assert.match(svg, /y="51"/)
  assert.equal(exportFilename("Solo Node"), "matchbox-solo-node.svg")
  assert.equal(exportFilename("⚡"), "matchbox-validator-gauge.svg")
})
