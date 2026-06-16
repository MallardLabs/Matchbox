import { WEEK, resolveWindow, snapToThursdayUTC } from "@/lib/academy/epoch"
import { ImageResponse } from "@vercel/og"
import type { NextRequest } from "next/server"

export const config = {
  runtime: "edge",
}

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

// Same formatting the leaderboard table uses (AcademyPublicLeaderboard.tsx).
function fmtPoints(wad: bigint): string {
  const value = Number(wad / 10n ** 12n) / 1e6
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
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
  const { fromTs, toTs: requestedToTs } = resolveWindow(
    searchParams.get("from"),
    searchParams.get("to"),
    now,
  )
  const toTs = Math.min(requestedToTs, snapToThursdayUTC(now, "down"))

  // Pull the leaderboard for this window from our own origin and derive the
  // same numbers the page shows in "Your stats" (AcademyPublicPage.tsx).
  let rankStr = "Unranked"
  let pointsWad = 0n
  let share = 0
  let activeEpochs = 0
  let totalEpochs = 0
  let fullyParticipated = false

  try {
    const lbUrl = new URL("/api/academy/leaderboard", req.url)
    lbUrl.searchParams.set("network", network)
    lbUrl.searchParams.set("from", String(fromTs))
    lbUrl.searchParams.set("to", String(toTs))
    lbUrl.searchParams.set("qualifiedOnly", qualifiedOnly)

    const res = await fetch(lbUrl.toString())
    const data = (await res.json()) as LeaderboardResponse
    if (data.success && data.rows) {
      const lower = actor.toLowerCase()
      const idx = data.rows.findIndex((r) => r.actor.toLowerCase() === lower)
      const total = data.rows.reduce((acc, r) => acc + BigInt(r.pointsWad), 0n)
      totalEpochs = data.totals?.totalEpochs ?? 0
      if (idx >= 0) {
        const row = data.rows[idx]
        if (row) {
          pointsWad = BigInt(row.pointsWad)
          activeEpochs = row.activeEpochs
          fullyParticipated = row.fullyParticipated
          rankStr = `#${idx + 1}`
          share = total > 0n ? Number((pointsWad * 10_000n) / total) / 100 : 0
        }
      }
    }
  } catch (err) {
    console.error("academy og: failed to load leaderboard", err)
  }

  const semesterEpochs = Math.max(1, Math.round((toTs - fromTs) / WEEK))
  const isFull = fullyParticipated && totalEpochs >= semesterEpochs
  const pointsStr = pointsWad > 0n ? fmtPoints(pointsWad) : "0"
  const shareStr = `${share.toFixed(2)}%`
  const participationStr = `${activeEpochs}/${semesterEpochs}`
  const epochStr = `${totalEpochs}/${semesterEpochs}`

  // Glyph subset for the font fetch — every character we render.
  const fontText =
    "POINTSRANKSHAREPARTICIPATIONEPCYUabcdefghijklmnopqrstuvwxyz0123456789.,#%/★ -"
  const [regular, bold] = await Promise.all([
    loadGoogleFont("IBM Plex Mono", 500, fontText),
    loadGoogleFont("IBM Plex Mono", 700, fontText),
  ])
  const fonts = [
    regular && {
      name: "IBM Plex Mono",
      data: regular,
      weight: 500,
      style: "normal",
    },
    bold && { name: "IBM Plex Mono", data: bold, weight: 700, style: "normal" },
  ].filter(Boolean) as {
    name: string
    data: ArrayBuffer
    weight: 500 | 700
    style: "normal"
  }[]

  const bgUrl = new URL("/academy-card-bg.png", req.url).toString()

  const labelStyle = {
    fontSize: "20px",
    fontWeight: 500,
    color: "#A89A88",
    textTransform: "uppercase" as const,
    letterSpacing: "3px",
  }
  const valueStyle = {
    fontSize: "46px",
    fontWeight: 700,
    color: "#FFFFFF",
  }

  const StatBlock = ({ label, value }: { label: string; value: string }) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "10px",
      }}
    >
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{value}</span>
    </div>
  )

  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        position: "relative",
        fontFamily: "IBM Plex Mono, monospace",
      }}
    >
      {/* Template background (logo, "Mezo Academy", gradient, footer baked in) */}
      <img
        src={bgUrl}
        alt=""
        width={1200}
        height={750}
        style={{ position: "absolute", top: 0, left: 0 }}
      />

      {/* Current Academy epoch — sits just under the "Mezo Academy" title */}
      <div
        style={{
          position: "absolute",
          top: "150px",
          right: "90px",
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
          width: "1200px",
          height: "750px",
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
            gap: "72px",
            marginTop: "56px",
          }}
        >
          <StatBlock label="Rank" value={rankStr} />
          <StatBlock label="Share" value={shareStr} />
          <StatBlock
            label="Participation"
            value={isFull ? `★ ${participationStr}` : participationStr}
          />
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 750,
      ...(fonts.length > 0 ? { fonts } : {}),
      headers: {
        "Cache-Control":
          "public, max-age=300, s-maxage=14400, stale-while-revalidate=3600",
        "Netlify-Vary": CACHE_VARY,
      },
    },
  )
}
