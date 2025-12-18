import {
  BOOST_VOTER_ABI,
  CHAIN_ID,
  CONTRACTS,
  VOTING_ESCROW_ABI,
} from "@repo/shared/contracts"
import { ImageResponse } from "@vercel/og"
import type { NextRequest } from "next/server"
import { http, createPublicClient, formatUnits } from "viem"

export const config = {
  runtime: "edge",
}

const mezoTestnet = {
  id: CHAIN_ID.testnet,
  name: "Mezo Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Bitcoin",
    symbol: "BTC",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.test.mezo.org"],
    },
  },
}

function formatLargeNumber(value: bigint, decimals = 18): string {
  const num = Number(formatUnits(value, decimals))
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`
  }
  return num.toFixed(2)
}

export default async function handler(req: NextRequest) {
  const client = createPublicClient({
    chain: mezoTestnet,
    transport: http(),
  })

  const contracts = CONTRACTS.testnet

  // Fetch platform stats
  let totalVeMEZOPower = 0n
  let totalGauges = 0

  try {
    const [veMEZOTotalPower, gaugeCount] = await Promise.all([
      client.readContract({
        address: contracts.veMEZO,
        abi: VOTING_ESCROW_ABI,
        functionName: "totalVotingPower",
      }) as Promise<bigint>,
      client.readContract({
        address: contracts.boostVoter,
        abi: BOOST_VOTER_ABI,
        functionName: "length",
      }) as Promise<bigint>,
    ])

    totalVeMEZOPower = veMEZOTotalPower
    totalGauges = Number(gaugeCount)
  } catch (error) {
    console.error("Error fetching platform stats:", error)
  }

  const logoUrl = new URL("/matchbox.png", req.url).toString()

  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#0A0A0A",
        padding: "48px",
        fontFamily: "IBM Plex Mono, monospace",
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", marginBottom: "48px" }}>
        <img
          src={logoUrl}
          alt="MatchBox"
          width={160}
          height={40}
          style={{ objectFit: "contain" }}
        />
      </div>

      {/* Title */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <h1
          style={{
            fontSize: "72px",
            fontWeight: 700,
            color: "#FFFFFF",
            margin: 0,
            marginBottom: "16px",
            letterSpacing: "-2px",
          }}
        >
          MATCHBOX
        </h1>
        <p
          style={{
            fontSize: "24px",
            color: "#888888",
            margin: 0,
            marginBottom: "64px",
          }}
        >
          Boost Voting for Mezo
        </p>

        {/* Stats */}
        <div
          style={{
            display: "flex",
            gap: "64px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                color: "#666666",
                textTransform: "uppercase",
                letterSpacing: "2px",
                marginBottom: "8px",
              }}
            >
              Total veMEZO Power
            </span>
            <span
              style={{
                fontSize: "48px",
                fontWeight: 700,
                color: "#F7931A",
              }}
            >
              {formatLargeNumber(totalVeMEZOPower)}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                color: "#666666",
                textTransform: "uppercase",
                letterSpacing: "2px",
                marginBottom: "8px",
              }}
            >
              Total Gauges
            </span>
            <span
              style={{
                fontSize: "48px",
                fontWeight: 700,
                color: "#F7931A",
              }}
            >
              {totalGauges}
            </span>
          </div>
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  )
}
