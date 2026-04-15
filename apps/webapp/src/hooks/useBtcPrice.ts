import { mezoMainnet } from "@/config/wagmi"
import { useReadContracts } from "wagmi"

// Skip Oracle contract address on Mezo mainnet (Chainlink-compatible interface).
// Keep this feed network-independent so testnet UI never prices with mock values.
// Docs: https://mezo.org/docs/developers/architecture/oracles/read-oracle
const SKIP_ORACLE_ADDRESS =
  "0x7b7c000000000000000000000000000000000015" as const

// Chainlink Aggregator ABI (only the functions we need)
const CHAINLINK_AGGREGATOR_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { internalType: "uint80", name: "roundId", type: "uint80" },
      { internalType: "int256", name: "answer", type: "int256" },
      { internalType: "uint256", name: "startedAt", type: "uint256" },
      { internalType: "uint256", name: "updatedAt", type: "uint256" },
      { internalType: "uint80", name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const

export function useBtcPrice(): {
  price: number | null
  updatedAt: Date | null
  isLoading: boolean
  isError: boolean
  refetch: () => void
} {
  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: [
      {
        address: SKIP_ORACLE_ADDRESS,
        abi: CHAINLINK_AGGREGATOR_ABI,
        functionName: "latestRoundData",
        chainId: mezoMainnet.id,
      },
      {
        address: SKIP_ORACLE_ADDRESS,
        abi: CHAINLINK_AGGREGATOR_ABI,
        functionName: "decimals",
        chainId: mezoMainnet.id,
      },
    ],
    query: {
      refetchInterval: 60000, // Refetch every minute
      refetchOnWindowFocus: false,
    },
  })

  const roundData = data?.[0]?.result
  const decimals = data?.[1]?.result

  let price: number | null = null
  let updatedAt: Date | null = null

  if (roundData && decimals !== undefined) {
    const [, answer, , updatedAtTimestamp] = roundData
    // Convert the price from fixed-point to a number
    const nextPrice = Number(answer) / 10 ** decimals
    price = nextPrice > 0 && Number.isFinite(nextPrice) ? nextPrice : null
    updatedAt = new Date(Number(updatedAtTimestamp) * 1000)
  }

  return {
    price,
    updatedAt,
    isLoading,
    isError,
    refetch,
  }
}
