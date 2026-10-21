// WalletConnect pairing helpers for our own connect dialog: the QR code (via
// `uqr`, imported only once WalletConnect is picked) and phone deep links.

export type QrCode = {
  /** Modules per side. */
  size: number
  /** One SVG path covering every dark module, in module units. */
  path: string
}

/**
 * Dark modules as one path; horizontal runs are merged so a 49×49 code is a
 * few hundred segments rather than one rect per module.
 */
export function qrPath(modules: readonly (readonly boolean[])[]): string {
  const parts: string[] = []
  modules.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      if (!row[x]) {
        x += 1
        continue
      }
      const start = x
      while (x < row.length && row[x]) x += 1
      parts.push(`M${start} ${y}h${x - start}v1h-${x - start}z`)
    }
  })
  return parts.join("")
}

let encoder: Promise<typeof import("uqr")> | undefined

/** Starts fetching the encoder early (when WalletConnect is picked). */
export function preloadQrEncoder(): void {
  encoder ??= import("uqr")
}

export async function encodeQr(text: string): Promise<QrCode> {
  preloadQrEncoder()
  const { encode } = await (encoder ?? import("uqr"))
  // The quiet zone comes from the card's padding, not the encoder.
  const qr = encode(text, { ecc: "M", border: 0 })
  return { size: qr.size, path: qrPath(qr.data) }
}

export type WalletLink = { name: string; href: string }

/**
 * Wallet apps that accept a WalletConnect URI through a universal link
 * (the same links RainbowKit uses on mobile), plus the bare `wc:` URI that
 * any installed WalletConnect wallet can claim.
 */
export function walletConnectLinks(uri: string): WalletLink[] {
  const encoded = encodeURIComponent(uri)
  return [
    {
      name: "MetaMask",
      href: `https://metamask.app.link/wc?uri=${encoded}`,
    },
    {
      name: "Trust Wallet",
      href: `https://link.trustwallet.com/wc?uri=${encoded}`,
    },
    { name: "Rainbow", href: `https://rnbwapp.com/wc?uri=${encoded}` },
    { name: "Zerion", href: `https://wallet.zerion.io/wc?uri=${encoded}` },
    { name: "Other wallet", href: uri },
  ]
}
