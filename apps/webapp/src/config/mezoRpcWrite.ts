import type { Address, Hex, JsonRpcAccount } from "viem"

export const MUTATION_RPC_METHODS = new Set([
  "eth_sendRawTransaction",
  "eth_sendRawTransactionSync",
  "eth_sendTransaction",
  "eth_signTransaction",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
  "personal_sign",
])

const HEX_STRING = /^0x[0-9a-fA-F]+$/
const EMPTY_RAW_TX_MESSAGE =
  "The wallet produced an empty signed transaction. Bitcoin and smart-account wallets often fail when Matchbox broadcasts via eth_sendRawTransaction. Approve the token in the explorer, then retry, or reconnect with MetaMask or Rabby."

export function isMutationRpcMethod(method: string): boolean {
  return MUTATION_RPC_METHODS.has(method)
}

export function toJsonRpcAccount(address: Address): JsonRpcAccount {
  return { address, type: "json-rpc" }
}

export function isHexTransaction(value: unknown): value is Hex {
  return (
    typeof value === "string" && HEX_STRING.test(value) && value.length >= 4
  )
}

export function normalizeRawTransaction(params: unknown): Hex {
  const first = Array.isArray(params) ? params[0] : undefined
  if (isHexTransaction(first)) {
    return first
  }

  if (first && typeof first === "object") {
    const record = first as Record<string, unknown>
    for (const key of [
      "serializedTransaction",
      "raw",
      "data",
      "signedTransaction",
    ]) {
      if (isHexTransaction(record[key])) {
        return record[key]
      }
    }
  }

  throw new Error(EMPTY_RAW_TX_MESSAGE)
}

export function prepareRpcRequest<
  TArgs extends { method: string; params?: unknown },
>(args: TArgs): TArgs {
  if (
    args.method !== "eth_sendRawTransaction" &&
    args.method !== "eth_sendRawTransactionSync"
  ) {
    return args
  }

  const rest = Array.isArray(args.params) ? args.params.slice(1) : []
  return {
    ...args,
    params: [normalizeRawTransaction(args.params), ...rest],
  }
}

export function formatWalletWriteError(error: Error): string {
  if (
    error.message.includes("empty signed transaction") ||
    /cannot unmarshal non-string into Go value of type hexutil\.Bytes/i.test(
      error.message,
    )
  ) {
    return EMPTY_RAW_TX_MESSAGE
  }

  return error.message
}
