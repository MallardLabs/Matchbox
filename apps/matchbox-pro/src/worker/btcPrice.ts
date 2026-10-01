import { CHAIN_ID } from "@repo/shared/contracts"
import { getAddress } from "viem"
import { formatFixedPoint } from "../lib/money"
import createMezoClient from "./mezoClient"

const SKIP_ORACLE = getAddress("0x7b7c000000000000000000000000000000000015")
const ORACLE_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const

type BtcPriceResponse = {
  price: string | null
  source: "skip-oracle" | "unavailable"
  timestamp: number
  reason?: string
}

export async function fetchBtcUsdPrice(): Promise<BtcPriceResponse> {
  const timestamp = Date.now()
  try {
    const client = createMezoClient(CHAIN_ID.mainnet)
    const [round, decimals] = await Promise.all([
      client.readContract({
        address: SKIP_ORACLE,
        abi: ORACLE_ABI,
        functionName: "latestRoundData",
      }),
      client.readContract({
        address: SKIP_ORACLE,
        abi: ORACLE_ABI,
        functionName: "decimals",
      }),
    ])
    const answer = round[1]
    if (answer <= 0n) {
      return { price: null, source: "unavailable", timestamp }
    }
    return {
      price: formatFixedPoint(answer, Number(decimals)),
      source: "skip-oracle",
      timestamp,
    }
  } catch (error) {
    return {
      price: null,
      source: "unavailable",
      timestamp,
      reason: error instanceof Error ? error.message : "rpc-error",
    }
  }
}
