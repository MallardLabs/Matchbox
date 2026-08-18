const CARD_WIDTH = 320
const CARD_HEIGHT = 236
const PAD_LEFT = 20
const PAD_RIGHT = 16
const PAD_TOP = 20
const AVATAR = 44
const HEADER_HEIGHT = 52

export type ValidatorGaugeSvgColors = {
  surface: string
  surfaceSecondary: string
  border: string
  contentPrimary: string
  contentSecondary: string
  contentTertiary: string
}

export type ValidatorGaugeSvgToken = {
  symbol: string
  iconDataUrl: string | null
}

export type ValidatorGaugeSvgModel = {
  displayName: string
  description: string | null
  avatarDataUrl: string | null
  avatarInitials: string
  weightLabel: string
  apyLabel: string
  incentivesLabel: string
  tokens: ValidatorGaugeSvgToken[]
  colors: ValidatorGaugeSvgColors
}

export type ValidatorGaugeSvgSource = {
  displayName: string
  description: string | null
  avatarUrl: string | null
  weightLabel: string
  apyLabel: string
  incentivesLabel: string
  tokens: Array<{ symbol: string; iconUrl: string | null }>
}

const DEFAULT_COLORS: ValidatorGaugeSvgColors = {
  surface: "#161616",
  surfaceSecondary: "#1e1e1e",
  border: "#2a2a2a",
  contentPrimary: "#fafaf9",
  contentSecondary: "#a8a29e",
  contentTertiary: "#a8a29e",
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

export function exportFilename(displayName: string): string {
  const safeName = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return `matchbox-${safeName || "validator-gauge"}.svg`
}

function estimateWidth(text: string, fontSize: number, mono: boolean): number {
  return text.length * fontSize * (mono ? 0.62 : 0.52)
}

function ellipsize(
  text: string,
  maxWidth: number,
  fontSize: number,
  mono: boolean,
): string {
  if (estimateWidth(text, fontSize, mono) <= maxWidth) return text
  let truncated = text
  while (
    truncated.length > 1 &&
    estimateWidth(`${truncated}…`, fontSize, mono) > maxWidth
  ) {
    truncated = truncated.slice(0, -1)
  }
  return `${truncated}…`
}

function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""

  for (const [index, word] of words.entries()) {
    const next = current ? `${current} ${word}` : word
    if (estimateWidth(next, fontSize, false) <= maxWidth) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = word
    if (lines.length === maxLines - 1) {
      lines.push(
        ellipsize(words.slice(index).join(" "), maxWidth, fontSize, false),
      )
      return lines
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, maxLines)
}

function readThemeColor(
  style: CSSStyleDeclaration,
  name: string,
  fallback: string,
): string {
  const value = style.getPropertyValue(name).trim()
  return value || fallback
}

export function readValidatorGaugeSvgColors(
  root: HTMLElement = document.documentElement,
): ValidatorGaugeSvgColors {
  const style = getComputedStyle(root)
  return {
    surface: readThemeColor(style, "--surface", DEFAULT_COLORS.surface),
    surfaceSecondary: readThemeColor(
      style,
      "--surface-secondary",
      DEFAULT_COLORS.surfaceSecondary,
    ),
    border: readThemeColor(style, "--border", DEFAULT_COLORS.border),
    contentPrimary: readThemeColor(
      style,
      "--content-primary",
      DEFAULT_COLORS.contentPrimary,
    ),
    contentSecondary: readThemeColor(
      style,
      "--content-secondary",
      DEFAULT_COLORS.contentSecondary,
    ),
    contentTertiary: readThemeColor(
      style,
      "--content-tertiary",
      DEFAULT_COLORS.contentTertiary,
    ),
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: "cors" })
    if (!response.ok) return null
    return blobToDataUrl(await response.blob())
  } catch {
    return null
  }
}

async function rasterizeImage(
  url: string,
  size: number,
): Promise<string | null> {
  try {
    const dataUrl = url.startsWith("data:") ? url : await fetchAsDataUrl(url)
    if (!dataUrl) return null
    const image = new Image()
    image.decoding = "async"
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("image"))
    })
    image.src = dataUrl
    await loaded
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")
    if (!context) return dataUrl
    context.drawImage(image, 0, 0, size, size)
    return canvas.toDataURL("image/png")
  } catch {
    return null
  }
}

function imageHref(
  dataUrl: string,
  x: number,
  y: number,
  size: number,
  clipPath?: string,
): string {
  const href = escapeXml(dataUrl)
  const clip = clipPath ? ` clip-path="url(#${clipPath})"` : ""
  return `<image href="${href}" xlink:href="${href}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice"${clip} />`
}

export function buildValidatorGaugeSvg(model: ValidatorGaugeSvgModel): string {
  const { colors } = model
  const textWidth = CARD_WIDTH - PAD_LEFT - PAD_RIGHT - AVATAR - 12
  const nameX = PAD_LEFT + AVATAR + 12
  const name = ellipsize(model.displayName, textWidth, 14, false)
  const descriptionLines = model.description
    ? wrapText(model.description, textWidth, 11, 2)
    : []
  const nameBaseline = descriptionLines.length > 0 ? PAD_TOP + 15 : PAD_TOP + 31
  const metricY = PAD_TOP + HEADER_HEIGHT + 16
  const incentivesY = metricY + 44
  const amountX = PAD_LEFT
  const amountY = incentivesY + 36
  const amountWidth = estimateWidth(model.incentivesLabel, 18, true)
  const metricCol = (CARD_WIDTH - PAD_LEFT - PAD_RIGHT) / 2

  const pills: string[] = []
  let pillX = amountX + amountWidth + 10
  const pillY = amountY - 16
  for (const token of model.tokens) {
    const symbol = ellipsize(token.symbol, 72, 12, true)
    const pillWidth = 8 + 16 + 4 + estimateWidth(symbol, 12, true) + 8
    if (pillX + pillWidth > CARD_WIDTH - PAD_RIGHT) break
    const icon = token.iconDataUrl
      ? imageHref(token.iconDataUrl, pillX + 8, pillY + 4, 16)
      : `<text x="${pillX + 16}" y="${pillY + 16}" text-anchor="middle" font-family="IBM Plex Sans, ui-sans-serif, system-ui, sans-serif" font-size="10" font-weight="600" fill="${escapeXml(colors.contentSecondary)}">${escapeXml(symbol.slice(0, 1))}</text>`
    pills.push(
      `<g>
        <rect x="${pillX}" y="${pillY}" width="${pillWidth}" height="24" rx="12" fill="${escapeXml(colors.surfaceSecondary)}" stroke="${escapeXml(colors.border)}" />
        ${icon}
        <text x="${pillX + 28}" y="${pillY + 16}" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="12" fill="${escapeXml(colors.contentSecondary)}">${escapeXml(symbol)}</text>
      </g>`,
    )
    pillX += pillWidth + 6
  }

  const avatar = model.avatarDataUrl
    ? `<defs><clipPath id="avatar-clip"><circle cx="${PAD_LEFT + 22}" cy="${PAD_TOP + 22}" r="22" /></clipPath></defs>
      <circle cx="${PAD_LEFT + 22}" cy="${PAD_TOP + 22}" r="22.5" fill="${escapeXml(colors.surfaceSecondary)}" stroke="${escapeXml(colors.border)}" />
      ${imageHref(model.avatarDataUrl, PAD_LEFT, PAD_TOP, AVATAR, "avatar-clip")}`
    : `<circle cx="${PAD_LEFT + 22}" cy="${PAD_TOP + 22}" r="22" fill="${escapeXml(colors.surfaceSecondary)}" stroke="${escapeXml(colors.border)}" />
      <text x="${PAD_LEFT + 22}" y="${PAD_TOP + 27}" text-anchor="middle" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="12" font-weight="600" fill="${escapeXml(colors.contentSecondary)}">${escapeXml(model.avatarInitials)}</text>`

  const descriptionMarkup = descriptionLines
    .map(
      (line, index) =>
        `<text x="${nameX}" y="${PAD_TOP + 32 + index * 14}" font-family="IBM Plex Sans, ui-sans-serif, system-ui, sans-serif" font-size="11" fill="${escapeXml(colors.contentSecondary)}">${escapeXml(line)}</text>`,
    )
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" role="img">
  <title>${escapeXml(model.displayName)}</title>
  <rect x="0.5" y="0.5" width="${CARD_WIDTH - 1}" height="${CARD_HEIGHT - 1}" rx="12" fill="${escapeXml(colors.surface)}" stroke="${escapeXml(colors.border)}" />
  ${avatar}
  <text x="${nameX}" y="${nameBaseline}" font-family="IBM Plex Sans, ui-sans-serif, system-ui, sans-serif" font-size="14" font-weight="600" fill="${escapeXml(colors.contentPrimary)}">${escapeXml(name)}</text>
  ${descriptionMarkup}
  <text x="${PAD_LEFT}" y="${metricY}" font-family="IBM Plex Sans, ui-sans-serif, system-ui, sans-serif" font-size="11" fill="${escapeXml(colors.contentTertiary)}">BTC Weight</text>
  <text x="${PAD_LEFT}" y="${metricY + 18}" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="13" fill="${escapeXml(colors.contentPrimary)}">${escapeXml(model.weightLabel)}</text>
  <text x="${PAD_LEFT + metricCol}" y="${metricY}" font-family="IBM Plex Sans, ui-sans-serif, system-ui, sans-serif" font-size="11" fill="${escapeXml(colors.contentTertiary)}">APY</text>
  <text x="${PAD_LEFT + metricCol}" y="${metricY + 18}" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="13" fill="${escapeXml(colors.contentPrimary)}">${escapeXml(model.apyLabel)}</text>
  <text x="${PAD_LEFT}" y="${incentivesY}" font-family="IBM Plex Sans, ui-sans-serif, system-ui, sans-serif" font-size="13" fill="${escapeXml(colors.contentTertiary)}">Incentives</text>
  <text x="${amountX}" y="${amountY}" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="18" font-weight="600" fill="${escapeXml(colors.contentPrimary)}">${escapeXml(model.incentivesLabel)}</text>
  ${pills.join("\n")}
</svg>
`
}

function downloadSvg(markup: string, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([markup], { type: "image/svg+xml;charset=utf-8" }),
  )
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function exportValidatorGaugeSvg(
  source: ValidatorGaugeSvgSource,
  filename: string,
): Promise<void> {
  const [avatarDataUrl, tokens] = await Promise.all([
    source.avatarUrl ? rasterizeImage(source.avatarUrl, AVATAR * 2) : null,
    Promise.all(
      source.tokens.map(async (token) => ({
        symbol: token.symbol,
        iconDataUrl: token.iconUrl
          ? await rasterizeImage(token.iconUrl, 32)
          : null,
      })),
    ),
  ])

  const markup = buildValidatorGaugeSvg({
    displayName: source.displayName,
    description: source.description,
    avatarDataUrl,
    avatarInitials: source.displayName.slice(0, 2).toUpperCase(),
    weightLabel: source.weightLabel,
    apyLabel: source.apyLabel,
    incentivesLabel: source.incentivesLabel,
    tokens,
    colors: readValidatorGaugeSvgColors(),
  })
  downloadSvg(markup, filename)
}
