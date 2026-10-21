import { http, type EIP1193RequestFn, type Hex, type Transport } from "viem"

// Ported from the webapp (commit 0fc8052): Bitcoin smart-account wallets
// (OrangeKit Safes behind Unisat, OKX, Xverse) can hand the transport an
// eth_sendRawTransaction with an object or empty payload, which mezod
// rejects. Writes go out unbatched, with the raw payload normalised first.

const MUTATION_RPC_METHODS = new Set([
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

export const EMPTY_RAW_TX_MESSAGE =
  "Your wallet produced an empty signed transaction. Bitcoin wallets can fail here; retry, or reconnect with MetaMask or Rabby."

export function isMutationRpcMethod(method: string): boolean {
  return MUTATION_RPC_METHODS.has(method)
}

function isHexTransaction(value: unknown): value is Hex {
  return (
    typeof value === "string" && HEX_STRING.test(value) && value.length >= 4
  )
}

export function normalizeRawTransaction(params: unknown): Hex {
  const first = Array.isArray(params) ? params[0] : undefined
  if (isHexTransaction(first)) return first
  if (first && typeof first === "object") {
    for (const key of [
      "serializedTransaction",
      "raw",
      "data",
      "signedTransaction",
    ]) {
      const value: unknown = Reflect.get(first, key)
      if (isHexTransaction(value)) return value
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

export function isEmptyRawTransactionError(message: string): boolean {
  return (
    message.includes("empty signed transaction") ||
    /cannot unmarshal non-string into Go value of type hexutil\.Bytes/i.test(
      message,
    )
  )
}

/** Batched reads, unbatched and normalised writes, against one Mezo RPC. */
export function mezoTransport(url: string, batchSize: number): Transport {
  const reads = http(url, {
    batch: { batchSize },
    fetchOptions: { cache: "no-store" },
  })
  const writes = http(url, { fetchOptions: { cache: "no-store" } })
  return (parameters) => {
    const read = reads(parameters)
    const write = writes(parameters)
    const request: EIP1193RequestFn = async (args) => {
      const prepared = prepareRpcRequest(args)
      return isMutationRpcMethod(prepared.method)
        ? write.request(prepared)
        : read.request(prepared)
    }
    return { ...read, request }
  }
}
