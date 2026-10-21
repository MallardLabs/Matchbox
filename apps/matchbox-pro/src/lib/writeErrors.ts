import { BaseError } from "viem"
import {
  EMPTY_RAW_TX_MESSAGE,
  isEmptyRawTransactionError,
} from "./wallet/rpcWrite"

export type WriteErrorKind =
  | "rejected"
  | "reverted"
  | "unsupported"
  | "timeout"
  | "unknown"

export type WriteFailure = {
  kind: WriteErrorKind
  message: string
}

// EIP-1193 user rejection and EIP-5792 "not supported" codes.
const USER_REJECTED = 4001
const UNSUPPORTED_CODES = new Set([4200, -32601, 5700, 5710])

function errorCode(error: unknown): number | undefined {
  if (error instanceof BaseError) {
    const found = error.walk((inner) => {
      return (
        typeof inner === "object" &&
        inner !== null &&
        "code" in inner &&
        typeof inner.code === "number"
      )
    })
    if (
      found &&
      typeof found === "object" &&
      "code" in found &&
      typeof found.code === "number"
    ) {
      return found.code
    }
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "number"
  ) {
    return error.code
  }
  return undefined
}

export function describeWriteError(error: unknown): WriteFailure {
  const code = errorCode(error)
  if (code === USER_REJECTED) {
    return { kind: "rejected", message: "Signature rejected in your wallet." }
  }
  if (code !== undefined && UNSUPPORTED_CODES.has(code)) {
    return {
      kind: "unsupported",
      message: "This wallet can't bundle these calls.",
    }
  }
  const raw = error instanceof Error ? error.message : ""
  if (isEmptyRawTransactionError(raw)) {
    return { kind: "unknown", message: EMPTY_RAW_TX_MESSAGE }
  }
  const name = error instanceof Error ? error.name : ""
  if (name === "WaitForCallsStatusTimeoutError" || name === "TimeoutError") {
    return {
      kind: "timeout",
      message:
        "Still waiting on the network. Check your wallet activity before trying again.",
    }
  }
  if (error instanceof BaseError) {
    return { kind: "unknown", message: error.shortMessage }
  }
  return {
    kind: "unknown",
    message: error instanceof Error ? error.message : "Transaction failed.",
  }
}
