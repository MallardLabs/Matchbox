import {
  type NetworkSlug,
  chainIdForNetwork,
  networkNames,
} from "@repo/platform-contracts/network"
import {
  BOOST_VOTER_ABI,
  CONTRACTS,
  NON_STAKING_GAUGE_ABI,
  VALIDATORS_VOTER_ABI,
  VOTING_ESCROW_ABI,
} from "@repo/shared/contracts"
import {
  http,
  type ContractFunctionParameters,
  createPublicClient,
  defineChain,
} from "viem"
import { z } from "zod"
import type { ChainStateRow, ReconciliationTarget } from "../store/api-store"

/** Canonical Multicall3 deployment (same address on Mezo mainnet/testnet). */
export const multicall3Address = "0xcA11bde05977b3631167028862bE2a173976CA11"

const zeroAddress = "0x0000000000000000000000000000000000000000"

/** Reads live gauge state for one network. */
export type ChainReader = {
  blockNumber(): Promise<bigint>
  /** One row per target; throws only when the whole batch fails. */
  readBatch(
    targets: readonly ReconciliationTarget[],
    blockNumber: bigint,
    checkedAt: string,
  ): Promise<ChainStateRow[]>
}

type CallResult =
  | { status: "success"; result: unknown }
  | { status: "failure"; error: unknown }

const addressResultSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => value.toLowerCase())

function booleanResult(result: CallResult | undefined): boolean | null {
  if (result?.status !== "success") return null
  return typeof result.result === "boolean" ? result.result : null
}

function addressResult(result: CallResult | undefined): string | null {
  if (result?.status !== "success") return null
  const parsed = addressResultSchema.safeParse(result.result)
  if (!parsed.success || parsed.data === zeroAddress) return null
  return parsed.data
}

function contractsFor(network: NetworkSlug) {
  return network === "mezo" ? CONTRACTS.mainnet : CONTRACTS.testnet
}

function hexAddress(value: string): `0x${string}` {
  const parsed = z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .transform((address): `0x${string}` => `0x${address.slice(2)}`)
    .parse(value)
  return parsed
}

/** Calls for one target, in a fixed order that `rowFromResults` reads. */
export function callsFor(
  network: NetworkSlug,
  target: ReconciliationTarget,
): ContractFunctionParameters[] {
  const contracts = contractsFor(network)
  const gauge = hexAddress(target.gaugeAddress)
  const beneficiary = {
    address: gauge,
    abi: NON_STAKING_GAUGE_ABI,
    functionName: "rewardsBeneficiary",
  } as const
  if (target.profileType === "validator-gauge") {
    return [
      {
        address: contracts.validatorsVoter,
        abi: VALIDATORS_VOTER_ABI,
        functionName: "isAlive",
        args: [gauge],
      },
      beneficiary,
    ]
  }
  const calls: ContractFunctionParameters[] = [
    {
      address: contracts.boostVoter,
      abi: BOOST_VOTER_ABI,
      functionName: "isAlive",
      args: [gauge],
    },
    beneficiary,
  ]
  if (target.vebtcTokenId !== null) {
    const tokenId = BigInt(target.vebtcTokenId)
    calls.push(
      {
        address: contracts.boostVoter,
        abi: BOOST_VOTER_ABI,
        functionName: "boostableTokenIdToGauge",
        args: [tokenId],
      },
      {
        address: contracts.veBTC,
        abi: VOTING_ESCROW_ABI,
        functionName: "ownerOf",
        args: [tokenId],
      },
    )
  }
  return calls
}

/** Maps the results of `callsFor(target)` to a chain-state row. */
export function rowFromResults(
  network: NetworkSlug,
  target: ReconciliationTarget,
  results: readonly CallResult[],
  meta: { blockNumber: bigint; checkedAt: string },
): ChainStateRow {
  const [alive, beneficiary, tokenGauge, owner] = results
  const confirmedToken =
    target.profileType === "boost-gauge" &&
    target.vebtcTokenId !== null &&
    addressResult(tokenGauge) === target.gaugeAddress
      ? target.vebtcTokenId
      : null
  return {
    network,
    gaugeAddress: target.gaugeAddress,
    isAlive: booleanResult(alive),
    vebtcTokenId: confirmedToken,
    nftOwner: confirmedToken === null ? null : addressResult(owner),
    beneficiary: addressResult(beneficiary),
    poolAddress: null,
    checkedAt: meta.checkedAt,
    blockNumber: meta.blockNumber.toString(),
  }
}

function isValidTarget(target: ReconciliationTarget): boolean {
  return (
    /^0x[0-9a-f]{40}$/.test(target.gaugeAddress) &&
    (target.vebtcTokenId === null || /^[0-9]{1,78}$/.test(target.vebtcTokenId))
  )
}

export function createViemChainReader(
  network: NetworkSlug,
  rpcUrl: string,
): ChainReader {
  const chain = defineChain({
    id: chainIdForNetwork(network),
    name: networkNames[network],
    nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
    rpcUrls: { default: { http: [rpcUrl] } },
    contracts: { multicall3: { address: multicall3Address } },
  })
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 15_000, retryCount: 1 }),
  })
  return {
    blockNumber() {
      return client.getBlockNumber()
    },
    async readBatch(targets, blockNumber, checkedAt) {
      const valid = targets.filter(isValidTarget)
      const plans = valid.map((target) => ({
        target,
        calls: callsFor(network, target),
      }))
      const results: CallResult[] = await client.multicall({
        allowFailure: true,
        blockNumber,
        contracts: plans.flatMap((plan) => plan.calls),
      })
      const rows: ChainStateRow[] = []
      let offset = 0
      for (const plan of plans) {
        const slice = results.slice(offset, offset + plan.calls.length)
        offset += plan.calls.length
        rows.push(
          rowFromResults(network, plan.target, slice, {
            blockNumber,
            checkedAt,
          }),
        )
      }
      return rows
    },
  }
}
