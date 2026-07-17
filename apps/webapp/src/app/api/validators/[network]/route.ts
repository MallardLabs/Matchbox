export { handler as GET, handler as OPTIONS }

import { MEZO_MAINNET_SERVER_RPC_ENDPOINTS } from "@/config/mezoRpc"
import type { ValidatorsResponse } from "@/lib/validators"
import {
  CHAIN_ID,
  CONTRACTS,
  NON_STAKING_GAUGE_ABI,
  VALIDATORS_VOTER_ABI,
  VALIDATOR_POOL_ABI,
} from "@repo/shared/contracts"
import { createLogger } from "@repo/shared/logger"
import { http, type Address, createPublicClient, defineChain } from "viem"

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000"
const mezoMainnet = defineChain({
  id: CHAIN_ID.mainnet,
  name: "Mezo Mainnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: [MEZO_MAINNET_SERVER_RPC_ENDPOINTS[0].url] } },
})
const mezoTestnet = defineChain({
  id: CHAIN_ID.testnet,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
})
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const
const logger = createLogger("validators-api")

type ValidatorMetadata = {
  consensusPublicKey: string
  moniker: string
  identity: string
  website: string
  securityContact: string
  details: string
}

const EMPTY_METADATA: ValidatorMetadata = {
  consensusPublicKey: "",
  moniker: "",
  identity: "",
  website: "",
  securityContact: "",
  details: "",
}

async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const segments = new URL(request.url).pathname.split("/").filter(Boolean)
  const requestedNetwork = segments.at(-1)
  if (requestedNetwork !== "mainnet" && requestedNetwork !== "testnet") {
    return new Response(JSON.stringify({ error: "Unsupported network" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
  const isTestnet = requestedNetwork === "testnet"
  const chain = isTestnet ? mezoTestnet : mezoMainnet
  const rpcUrl = isTestnet
    ? (process.env.NEXT_PUBLIC_RPC_TESTNET_URL ?? "https://rpc.test.mezo.org")
    : (process.env.MEZO_RPC_URL ?? MEZO_MAINNET_SERVER_RPC_ENDPOINTS[0].url)
  const client = createPublicClient({ chain, transport: http(rpcUrl) })
  const addresses = CONTRACTS[isTestnet ? "testnet" : "mainnet"]
  const voter = addresses.validatorsVoter
  const validatorPool = addresses.validatorPool

  try {
    const [operators, totalWeight] = await Promise.all([
      client.readContract({
        address: validatorPool,
        abi: VALIDATOR_POOL_ABI,
        functionName: "validators",
      }),
      client
        .readContract({
          address: voter,
          abi: VALIDATORS_VOTER_ABI,
          functionName: "totalWeight",
        })
        .catch(() => 0n),
    ])
    const data = await Promise.all(
      operators.map(async (operator) => {
        const [rawMetadata, gauge] = await Promise.all([
          client
            .readContract({
              address: validatorPool,
              abi: VALIDATOR_POOL_ABI,
              functionName: "validator",
              args: [operator],
            })
            .then(([consensusPublicKey, description]) => ({
              consensusPublicKey,
              moniker: description.moniker,
              identity: description.identity,
              website: description.website,
              securityContact: description.securityContact,
              details: description.details,
            }))
            .catch(() => EMPTY_METADATA),
          client
            .readContract({
              address: voter,
              abi: VALIDATORS_VOTER_ABI,
              functionName: "validatorToGauge",
              args: [operator],
            })
            .catch(() => ZERO_ADDRESS),
        ])

        const [bribe, beneficiary, weight, isAlive] =
          gauge === ZERO_ADDRESS
            ? [ZERO_ADDRESS, operator, 0n, false]
            : await Promise.all([
                client
                  .readContract({
                    address: voter,
                    abi: VALIDATORS_VOTER_ABI,
                    functionName: "gaugeToBribe",
                    args: [gauge],
                  })
                  .catch(() => ZERO_ADDRESS),
                client
                  .readContract({
                    address: gauge,
                    abi: NON_STAKING_GAUGE_ABI,
                    functionName: "rewardsBeneficiary",
                  })
                  .catch(() => operator),
                client
                  .readContract({
                    address: voter,
                    abi: VALIDATORS_VOTER_ABI,
                    functionName: "weights",
                    args: [gauge],
                  })
                  .catch(() => 0n),
                client
                  .readContract({
                    address: voter,
                    abi: VALIDATORS_VOTER_ABI,
                    functionName: "isAlive",
                    args: [gauge],
                  })
                  .catch(() => false),
              ])

        return {
          operator,
          ...rawMetadata,
          gauge,
          bribe,
          beneficiary,
          weight: weight.toString(),
          isAlive,
        }
      }),
    )

    const body: ValidatorsResponse = {
      success: true,
      data,
      totalWeight: totalWeight.toString(),
    }
    return Response.json(body, {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    })
  } catch (error) {
    logger.error({
      message: "Unable to load validator registry",
      error: error instanceof Error ? error.message : "unknown",
      network: requestedNetwork,
    })
    return Response.json(
      { success: false, error: "Unable to load validators" },
      { status: 502, headers: CORS_HEADERS },
    )
  }
}
