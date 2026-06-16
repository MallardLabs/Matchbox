import { WEEK, resolveWindow } from "@/lib/academy/epoch"
import { ImageResponse } from "@vercel/og"
import type { NextRequest } from "next/server"

export const config = {
  runtime: "edge",
}

const WIDTH = 1280
const HEIGHT = 750

// Per-actor, per-window image behind the CDN. Netlify ignores query params in
// the cache key unless told otherwise, so without this every wallet collapses
// onto one cached card. Mirrors the leaderboard route's CACHE_VARY.
const CACHE_VARY = "query=actor|from|to|network|qualifiedOnly"

type LeaderboardRowLite = {
  actor: string
  pointsWad: string
  activeEpochs: number
  fullyParticipated: boolean
}

type LeaderboardResponse = {
  success: boolean
  rows?: LeaderboardRowLite[]
  totals?: { totalEpochs: number }
  error?: string
}

type Standing = {
  rankStr: string
  pointsWad: bigint
  share: number
  activeEpochs: number
  totalEpochs: number
  fullyParticipated: boolean
}

// Same formatting the leaderboard table uses (AcademyPublicLeaderboard.tsx).
function fmtPoints(wad: bigint): string {
  const value = Number(wad / 10n ** 12n) / 1e6
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

// Pull the leaderboard for this window from our own origin and derive the same
// numbers the page shows in "Your stats" (AcademyPublicPage.tsx). The
// leaderboard route is CDN-cached, so repeat card renders are cheap.
async function loadStanding(
  origin: string,
  actor: string,
  network: string,
  fromTs: number,
  toTs: number,
  qualifiedOnly: string,
): Promise<Standing> {
  const empty: Standing = {
    rankStr: "Unranked",
    pointsWad: 0n,
    share: 0,
    activeEpochs: 0,
    totalEpochs: 0,
    fullyParticipated: false,
  }
  try {
    const lbUrl = new URL("/api/academy/leaderboard", origin)
    lbUrl.searchParams.set("network", network)
    lbUrl.searchParams.set("from", String(fromTs))
    lbUrl.searchParams.set("to", String(toTs))
    lbUrl.searchParams.set("qualifiedOnly", qualifiedOnly)

    const res = await fetch(lbUrl.toString())
    const data = (await res.json()) as LeaderboardResponse
    if (!data.success || !data.rows) return empty

    const totalEpochs = data.totals?.totalEpochs ?? 0
    const lower = actor.toLowerCase()
    const idx = data.rows.findIndex((r) => r.actor.toLowerCase() === lower)
    if (idx < 0) return { ...empty, totalEpochs }

    const row = data.rows[idx]
    if (!row) return { ...empty, totalEpochs }
    const total = data.rows.reduce((acc, r) => acc + BigInt(r.pointsWad), 0n)
    const pointsWad = BigInt(row.pointsWad)
    return {
      rankStr: `#${idx + 1}`,
      pointsWad,
      share: total > 0n ? Number((pointsWad * 10_000n) / total) / 100 : 0,
      activeEpochs: row.activeEpochs,
      totalEpochs,
      fullyParticipated: row.fullyParticipated,
    }
  } catch (err) {
    console.error("academy og: failed to load leaderboard", err)
    return empty
  }
}

// Fetch a Google font as TTF (Satori cannot parse woff2). An archaic
// User-Agent makes Google serve TrueType instead of woff2. The `text` subset
// keeps the payload tiny and reliable on the edge. Returns null on any
// failure so the card still renders with Satori's default font.
async function loadGoogleFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer | null> {
  try {
    const params = new URLSearchParams({
      family: `${family}:wght@${weight}`,
      text,
    })
    const cssRes = await fetch(
      `https://fonts.googleapis.com/css2?${params.toString()}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1)",
        },
      },
    )
    if (!cssRes.ok) return null
    const css = await cssRes.text()
    const match = css.match(
      /src:\s*url\(([^)]+)\)\s*format\(['"]?(?:truetype|opentype)['"]?\)/,
    )
    if (!match?.[1]) return null
    const fontRes = await fetch(match[1])
    if (!fontRes.ok) return null
    return await fontRes.arrayBuffer()
  } catch {
    return null
  }
}

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const actor = searchParams.get("actor")
  if (!actor) {
    return new Response("Missing actor parameter", { status: 400 })
  }

  const network = searchParams.get("network") ?? "mainnet"
  // Floor-gated by default (matches the inaugural-season leaderboard view); the
  // caller can pass qualifiedOnly=0 for no-floor seasons so rank/share line up
  // with what the page renders.
  const qualifiedOnly = searchParams.get("qualifiedOnly") ?? "1"

  const now = Math.floor(Date.now() / 1000)
  // `toTs` here is the season END (may be in the future). The leaderboard route
  // clamps it to the last completed epoch for the simulation, so we pass it
  // straight through and size the season from the full, unclamped window —
  // otherwise an in-progress season reports e.g. 2/2 instead of 2/8.
  const { fromTs, toTs } = resolveWindow(
    searchParams.get("from"),
    searchParams.get("to"),
    now,
  )
  const semesterEpochs = Math.max(1, Math.round((toTs - fromTs) / WEEK))

  // Glyph subset for the font fetch — every character we render.
  const fontText = "POINTSRANKSHAREPARTICIPATIONEPCHUnranked0123456789.,#%/- "

  // Standings and fonts are independent — fetch them concurrently so the slower
  // of the two (usually the leaderboard) sets the wall-clock, not their sum.
  const [standing, regular, bold] = await Promise.all([
    loadStanding(req.url, actor, network, fromTs, toTs, qualifiedOnly),
    loadGoogleFont("IBM Plex Sans", 500, fontText),
    loadGoogleFont("IBM Plex Sans", 700, fontText),
  ])

  const fonts = [
    regular && {
      name: "IBM Plex Sans",
      data: regular,
      weight: 500,
      style: "normal",
    },
    bold && { name: "IBM Plex Sans", data: bold, weight: 700, style: "normal" },
  ].filter(Boolean) as {
    name: string
    data: ArrayBuffer
    weight: 500 | 700
    style: "normal"
  }[]

  const isFull =
    standing.fullyParticipated && standing.totalEpochs >= semesterEpochs
  const pointsStr =
    standing.pointsWad > 0n ? fmtPoints(standing.pointsWad) : "0"
  const shareStr = `${standing.share.toFixed(2)}%`
  const participationStr = `${standing.activeEpochs}/${semesterEpochs}`
  const epochStr = `${standing.totalEpochs}/${semesterEpochs}`

  const bgUrl = new URL("/academy-card-bg.png", req.url).toString()

  const labelStyle = {
    fontSize: "20px",
    fontWeight: 500,
    color: "#A89A88",
    textTransform: "uppercase" as const,
    letterSpacing: "3px",
  }
  const valueStyle = {
    fontSize: "48px",
    fontWeight: 700,
    color: "#FFFFFF",
  }

  const StatBlock = ({
    label,
    value,
    star,
  }: { label: string; value: string; star?: boolean }) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <span style={labelStyle}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {star ? (
          // Rendered as SVG (not a ★ glyph) so it always shows — the subset font
          // doesn't carry U+2605.
          <svg
            width="38"
            height="38"
            viewBox="0 0 24 24"
            fill="#F7931A"
            aria-hidden="true"
          >
            <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.782 1.401 8.168L12 18.896l-7.335 3.864 1.401-8.168L.132 9.21l8.2-1.192z" />
          </svg>
        ) : null}
        <span style={valueStyle}>{value}</span>
      </div>
    </div>
  )

  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        position: "relative",
        fontFamily: "IBM Plex Sans, sans-serif",
      }}
    >
      {/* Template background (logo, "Mezo Academy", gradient, footer baked in) */}
      <img
        src={bgUrl}
        alt=""
        width={WIDTH}
        height={HEIGHT}
        style={{ position: "absolute", top: 0, left: 0 }}
      />

      {/* Current Academy epoch — sits just under the "Mezo Academy" title */}
      <div
        style={{
          position: "absolute",
          top: "150px",
          right: "96px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <span
          style={{
            fontSize: "18px",
            fontWeight: 500,
            color: "#A89A88",
            textTransform: "uppercase",
            letterSpacing: "3px",
          }}
        >
          Epoch
        </span>
        <span style={{ fontSize: "26px", fontWeight: 700, color: "#F7931A" }}>
          {epochStr}
        </span>
      </div>

      {/* Dynamic standings, centered in the template's empty band */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${WIDTH}px`,
          height: `${HEIGHT}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: "36px",
        }}
      >
        <span style={{ ...labelStyle, fontSize: "22px" }}>Points</span>
        <span
          style={{
            fontSize: "150px",
            fontWeight: 700,
            color: "#FFFFFF",
            lineHeight: 1,
            marginTop: "6px",
          }}
        >
          {pointsStr}
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "104px",
            marginTop: "60px",
          }}
        >
          <StatBlock label="Rank" value={standing.rankStr} />
          <StatBlock label="Share" value={shareStr} />
          <StatBlock
            label="Participation"
            value={participationStr}
            star={isFull}
          />
        </div>
      </div>
    </div>,
    {
      width: WIDTH,
      height: HEIGHT,
      ...(fonts.length > 0 ? { fonts } : {}),
      headers: {
        "Cache-Control":
          "public, max-age=300, s-maxage=14400, stale-while-revalidate=3600",
        "Netlify-Vary": CACHE_VARY,
      },
    },
  )
}
