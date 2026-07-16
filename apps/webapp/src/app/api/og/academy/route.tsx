import { WEEK, resolveWindow } from "@/lib/academy/epoch"
import { ImageResponse } from "next/og"
import type { NextRequest } from "next/server"

const WIDTH = 1280
const HEIGHT = 750

// Per-actor, per-window image behind the CDN. Netlify ignores query params in
// the cache key unless told otherwise, so without this every wallet collapses
// onto one cached card. `v` is a manual cache-key version: bump it (and the
// callers) whenever the rendering changes, so stale CDN entries are bypassed.
const CACHE_VARY = "query=v|actor|from|to|network|qualifiedOnly"

// @vercel/og hard-codes `Cache-Control: public, immutable, no-transform,
// max-age=31536000`, which pins the FIRST render in the browser and Netlify's
// durable cache effectively forever — the card never reflects new data or code.
// We replace it with a revalidating policy (mirrors the leaderboard route).
const CARD_CACHE_CONTROL =
  "public, max-age=300, s-maxage=14400, stale-while-revalidate=3600"

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

// Load an IBM Plex Sans weight as WOFF, straight from the Fontsource CDN.
// Satori parses ttf/otf/woff but NOT woff2/eot — and Google's css2 endpoint only
// hands those out (woff2 to modern UAs, eot to archaic ones), so we fetch the
// woff file directly instead. Returns null on failure so the card still renders
// with Satori's default font rather than erroring.
async function loadPlexSans(weight: 500 | 700): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(
      `https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans@5/files/ibm-plex-sans-latin-${weight}-normal.woff`,
    )
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
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

  // Standings and fonts are independent — fetch them concurrently so the slower
  // of the two (usually the leaderboard) sets the wall-clock, not their sum.
  const [standing, regular, bold] = await Promise.all([
    loadStanding(req.url, actor, network, fromTs, toTs, qualifiedOnly),
    loadPlexSans(500),
    loadPlexSans(700),
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

  const FONT_FAMILY = "IBM Plex Sans, sans-serif"
  const labelStyle = {
    fontFamily: FONT_FAMILY,
    fontSize: "20px",
    fontWeight: 500,
    color: "#A89A88",
    textTransform: "uppercase" as const,
    letterSpacing: "3px",
  }
  const valueStyle = {
    fontFamily: FONT_FAMILY,
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

  const image = new ImageResponse(
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
            fontFamily: FONT_FAMILY,
            fontSize: "18px",
            fontWeight: 500,
            color: "#A89A88",
            textTransform: "uppercase",
            letterSpacing: "3px",
          }}
        >
          Epoch
        </span>
        <span
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: "26px",
            fontWeight: 700,
            color: "#F7931A",
          }}
        >
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
            fontFamily: FONT_FAMILY,
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
    },
  )

  // Rebuild the response so our Cache-Control fully REPLACES @vercel/og's
  // immutable default (passing it via options merely appends, leaving the
  // immutable directive in place).
  const headers = new Headers(image.headers)
  headers.set("Cache-Control", CARD_CACHE_CONTROL)
  headers.set("Netlify-Vary", CACHE_VARY)
  return new Response(image.body, { status: image.status, headers })
}
