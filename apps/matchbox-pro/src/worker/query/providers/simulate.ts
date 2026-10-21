import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  type Hex,
  decodeErrorResult,
  parseAbi,
} from "viem"
import type { MezoClient } from "./rpc"

export type CallToSimulate = { to: Address; data: Hex }

export type SimulatedCall = {
  status: "passed" | "reverted" | "not_run"
  gasEstimate: bigint | null
  reason: string | null
}

const COMMON_ERRORS = parseAbi([
  "error Error(string)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error AlreadyVotedOrDeposited()",
  "error DistributeWindow()",
  "error NotWhitelistedNFT()",
  "error ZeroBalance()",
  "error TooManyGauges()",
  "error TooManyPools()",
  "error NonZeroVotes()",
  "error GaugeNotAlive(address gauge)",
  "error GaugeDoesNotExist(address gauge)",
  "error NotApprovedOrOwner()",
])

function shortReason(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 160)
}

export function revertReason(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk(
      (cause) => cause instanceof ContractFunctionRevertedError,
    )
    if (reverted instanceof ContractFunctionRevertedError) {
      const reason = reverted.reason ?? reverted.data?.errorName
      if (reason) return shortReason(reason)
    }
    return shortReason(error.shortMessage)
  }
  return "Simulation failed"
}

function decodeRevertData(data: Hex | undefined): string {
  if (!data || data === "0x") return "Reverted without a reason"
  try {
    const decoded = decodeErrorResult({ abi: COMMON_ERRORS, data })
    if (decoded.errorName === "Error") {
      const [message] = decoded.args
      return shortReason(String(message))
    }
    return decoded.errorName
  } catch {
    return "Reverted"
  }
}

/** eth_call + eth_estimateGas for one independent call. */
export async function simulateSingle(
  client: MezoClient,
  from: Address,
  call: CallToSimulate,
): Promise<SimulatedCall> {
  try {
    await client.call({ account: from, to: call.to, data: call.data })
  } catch (error) {
    return {
      status: "reverted",
      gasEstimate: null,
      reason: revertReason(error),
    }
  }
  const gasEstimate = await client
    .estimateGas({ account: from, to: call.to, data: call.data })
    .catch(() => null)
  return { status: "passed", gasEstimate, reason: null }
}

/**
 * One stateful eth_simulateV1 block, so a deposit sees the approval and swap
 * before it. Mezod's simulated gasUsed is not meaningful; it is not shown.
 */
export async function simulateSequence(
  client: MezoClient,
  from: Address,
  calls: readonly CallToSimulate[],
): Promise<SimulatedCall[]> {
  try {
    const [block] = await client.simulateBlocks({
      blocks: [
        {
          calls: calls.map((call) => ({
            account: from,
            to: call.to,
            data: call.data,
          })),
        },
      ],
      validation: false,
    })
    const results = block?.calls ?? []
    return calls.map((_, index) => {
      const result = results[index]
      if (!result) return { status: "not_run", gasEstimate: null, reason: null }
      if (result.status === "success") {
        return { status: "passed", gasEstimate: null, reason: null }
      }
      return {
        status: "reverted",
        gasEstimate: null,
        reason: decodeRevertData(result.data),
      }
    })
  } catch {
    return calls.map(() => ({
      status: "not_run",
      gasEstimate: null,
      reason: "Simulation unavailable",
    }))
  }
}
