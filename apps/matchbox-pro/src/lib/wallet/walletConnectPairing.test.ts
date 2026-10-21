import { describe, expect, it } from "vitest"
import { encodeQr, qrPath, walletConnectLinks } from "./walletConnectPairing"

const URI =
  "wc:8f2a1c0e9b7d4a3f6e5c2b1a0d9e8f7c6b5a4d3e2f1a0b9c8d7e6f5a4b3c2d1e@2?relay-protocol=irn&symKey=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef&expiryTimestamp=1792627200"

/** Paints a path back onto a grid, to check it covers exactly the modules. */
function paint(path: string, size: number): boolean[][] {
  const grid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  )
  for (const [, x, y, run] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(run); i += 1) {
      const row = grid[Number(y)]
      if (row) row[Number(x) + i] = true
    }
  }
  return grid
}

describe("WalletConnect pairing", () => {
  it("draws dark modules as merged horizontal runs", () => {
    const modules = [
      [true, true, false, true],
      [false, false, false, false],
      [true, false, true, true],
    ]
    expect(qrPath(modules)).toBe(
      "M0 0h2v1h-2zM3 0h1v1h-1zM0 2h1v1h-1zM2 2h2v1h-2z",
    )
  })

  it("encodes a real pairing URI into a square code the path reproduces", async () => {
    const code = await encodeQr(URI)
    expect(code.size).toBeGreaterThanOrEqual(21)
    const { encode } = await import("uqr")
    const reference = encode(URI, { ecc: "M", border: 0 })
    expect(paint(code.path, code.size)).toEqual(reference.data)
  })

  it("links wallets with the URI encoded, and offers the bare URI", () => {
    const links = walletConnectLinks(URI)
    expect(links.map((link) => link.name)).toEqual([
      "MetaMask",
      "Trust Wallet",
      "Rainbow",
      "Zerion",
      "Other wallet",
    ])
    expect(links[0]?.href).toBe(
      `https://metamask.app.link/wc?uri=${encodeURIComponent(URI)}`,
    )
    expect(links.at(-1)?.href).toBe(URI)
  })
})
