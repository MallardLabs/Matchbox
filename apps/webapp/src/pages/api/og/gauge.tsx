import type { GaugeProfile } from "@/config/supabase"
import {
  BOOST_VOTER_ABI,
  CHAIN_ID,
  CONTRACTS,
  NON_STAKING_GAUGE_ABI,
  VOTING_ESCROW_ABI,
} from "@repo/shared/contracts"
import { createClient } from "@supabase/supabase-js"
import { ImageResponse } from "@vercel/og"
import type { NextRequest } from "next/server"
import { http, type Address, createPublicClient, formatUnits } from "viem"

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

function truncateDescription(
  text: string | null | undefined,
  maxLength = 100,
): string {
  if (!text) return ""
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trim()}...`
}

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get("address")

  if (!address) {
    return new Response("Missing address parameter", { status: 400 })
  }

  const gaugeAddress = address.toLowerCase() as Address

  // Initialize clients
  const client = createPublicClient({
    chain: mezoTestnet,
    transport: http(),
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const contracts = CONTRACTS.testnet

  // Fetch profile from Supabase
  let profile: GaugeProfile | null = null
  try {
    const { data } = await supabase
      .from("gauge_profiles")
      .select("*")
      .eq("gauge_address", gaugeAddress)
      .single()
    profile = data as GaugeProfile | null
  } catch (error) {
    console.error("Error fetching gauge profile:", error)
  }

  // Fetch on-chain data
  let veMEZOWeight = 0n
  let veBTCWeight = 0n
  let boostMultiplier = 1
  let veBTCTokenId: bigint | undefined

  try {
    // Get gauge weight (veMEZO votes)
    const weight = (await client.readContract({
      address: contracts.boostVoter,
      abi: BOOST_VOTER_ABI,
      functionName: "weights",
      args: [gaugeAddress],
    })) as bigint
    veMEZOWeight = weight

    // Get beneficiary to find veBTC token
    const beneficiary = (await client.readContract({
      address: gaugeAddress,
      abi: NON_STAKING_GAUGE_ABI,
      functionName: "rewardsBeneficiary",
    })) as Address

    if (
      beneficiary &&
      beneficiary !== "0x0000000000000000000000000000000000000000"
    ) {
      // Get beneficiary's veBTC balance
      const balance = (await client.readContract({
        address: contracts.veBTC,
        abi: VOTING_ESCROW_ABI,
        functionName: "balanceOf",
        args: [beneficiary],
      })) as bigint

      if (balance > 0n) {
        // Find the veBTC token that maps to this gauge
        const tokenIds: bigint[] = []
        for (let i = 0; i < Number(balance); i++) {
          const tokenId = (await client.readContract({
            address: contracts.veBTC,
            abi: VOTING_ESCROW_ABI,
            functionName: "ownerToNFTokenIdList",
            args: [beneficiary, BigInt(i)],
          })) as bigint
          tokenIds.push(tokenId)
        }

        // Check which token maps to our gauge
        for (const tokenId of tokenIds) {
          const mappedGauge = (await client.readContract({
            address: contracts.boostVoter,
            abi: BOOST_VOTER_ABI,
            functionName: "boostableTokenIdToGauge",
            args: [tokenId],
          })) as Address

          if (mappedGauge.toLowerCase() === gaugeAddress) {
            veBTCTokenId = tokenId

            // Get veBTC voting power
            const votingPower = (await client.readContract({
              address: contracts.veBTC,
              abi: VOTING_ESCROW_ABI,
              functionName: "votingPowerOfNFT",
              args: [tokenId],
            })) as bigint
            veBTCWeight = votingPower

            // Get boost
            const boost = (await client.readContract({
              address: contracts.boostVoter,
              abi: BOOST_VOTER_ABI,
              functionName: "getBoost",
              args: [tokenId],
            })) as bigint
            boostMultiplier = Number(boost) / 1e18

            break
          }
        }
      }
    }
  } catch (error) {
    console.error("Error fetching on-chain data:", error)
  }

  const logoUrl = new URL("/matchbox.png", req.url).toString()
  const displayName =
    profile?.display_name ?? `veBTC #${veBTCTokenId?.toString() ?? "Unknown"}`
  const description = truncateDescription(profile?.description)
  const profilePicture = profile?.profile_picture_url

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
      <div style={{ display: "flex", marginBottom: "32px" }}>
        <img
          src={logoUrl}
          alt="MatchBox"
          width={140}
          height={35}
          style={{ objectFit: "contain" }}
        />
      </div>

      {/* Profile Section */}
      <div
        style={{
          display: "flex",
          flex: 1,
          gap: "32px",
        }}
      >
        {/* Profile Picture */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "160px",
              height: "160px",
              borderRadius: "24px",
              overflow: "hidden",
              border: "4px solid #333333",
              backgroundColor: "#1A1A1A",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {profilePicture ? (
              <img
                src={profilePicture}
                alt={displayName}
                width={160}
                height={160}
                style={{ objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "48px",
                    fontWeight: 700,
                    color: "#666666",
                  }}
                >
                  #
                </span>
                <span
                  style={{
                    fontSize: "24px",
                    fontWeight: 600,
                    color: "#666666",
                  }}
                >
                  {veBTCTokenId?.toString() ?? "?"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
          }}
        >
          <h1
            style={{
              fontSize: "48px",
              fontWeight: 700,
              color: "#FFFFFF",
              margin: 0,
              marginBottom: "8px",
              letterSpacing: "-1px",
            }}
          >
            {displayName}
          </h1>

          {profile?.display_name && veBTCTokenId && (
            <span
              style={{
                fontSize: "16px",
                color: "#F7931A",
                marginBottom: "16px",
              }}
            >
              veBTC #{veBTCTokenId.toString()}
            </span>
          )}

          {description && (
            <p
              style={{
                fontSize: "18px",
                color: "#888888",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div
        style={{
          display: "flex",
          gap: "48px",
          borderTop: "1px solid #333333",
          paddingTop: "32px",
          marginTop: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              color: "#666666",
              textTransform: "uppercase",
              letterSpacing: "2px",
              marginBottom: "4px",
            }}
          >
            veBTC Weight
          </span>
          <span
            style={{
              fontSize: "32px",
              fontWeight: 700,
              color: "#FFFFFF",
            }}
          >
            {formatLargeNumber(veBTCWeight)}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              color: "#666666",
              textTransform: "uppercase",
              letterSpacing: "2px",
              marginBottom: "4px",
            }}
          >
            veMEZO Weight
          </span>
          <span
            style={{
              fontSize: "32px",
              fontWeight: 700,
              color: "#FFFFFF",
            }}
          >
            {formatLargeNumber(veMEZOWeight)}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              color: "#666666",
              textTransform: "uppercase",
              letterSpacing: "2px",
              marginBottom: "4px",
            }}
          >
            Boost
          </span>
          <span
            style={{
              fontSize: "32px",
              fontWeight: 700,
              color: "#F7931A",
            }}
          >
            {boostMultiplier.toFixed(2)}x
          </span>
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  )
}
