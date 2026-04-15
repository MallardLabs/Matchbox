import {
  MEZO_MAINNET_RPC_ACTIVE_EVENT,
  MEZO_MAINNET_RPC_ENDPOINTS,
  type MezoMainnetRpcEndpoint,
  getMezoMainnetRpcEndpoint,
  readMezoMainnetRpcPreference,
} from "@/config/mezoRpc"
import type { EIP1193RequestFn } from "viem"
import { http, type Transport } from "wagmi"

const RATE_LIMIT_COOLDOWN_MS = 30_000

let activeAutoRpcIndex = 0

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined
  }

  const status = "status" in error ? error.status : undefined
  if (typeof status === "number") {
    return status
  }

  const cause = "cause" in error ? error.cause : undefined
  return getErrorStatus(cause)
}

function getErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined
  }

  const code = "code" in error ? error.code : undefined
  if (typeof code === "number") {
    return code
  }

  const cause = "cause" in error ? error.cause : undefined
  return getErrorCode(cause)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }

  return String(error)
}

function isRetryableRpcError(error: unknown): boolean {
  const status = getErrorStatus(error)
  if (status === 429 || (status !== undefined && status >= 500)) {
    return true
  }

  const code = getErrorCode(error)
  const message = getErrorMessage(error)
  if (code === -32005 || /429|rate.?limit|too many requests/i.test(message)) {
    return true
  }

  return /HttpRequestError|TimeoutError|Failed to fetch|NetworkError/i.test(
    message,
  )
}

function publishActiveEndpoint(endpoint: MezoMainnetRpcEndpoint) {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(
    new CustomEvent(MEZO_MAINNET_RPC_ACTIVE_EVENT, {
      detail: { endpoint },
    }),
  )
}

function getArrayItem<T>(items: readonly T[], index: number): T {
  const item = items[index] ?? items[0]
  if (item === undefined) {
    throw new Error("No Mezo mainnet RPC endpoints configured")
  }

  return item
}

export function createMezoMainnetTransport(): Transport {
  const transports = MEZO_MAINNET_RPC_ENDPOINTS.map((endpoint) =>
    http(endpoint.url, {
      batch: true,
      fetchOptions: { cache: "no-store" },
      retryCount: 0,
    }),
  )

  return ((parameters) => {
    const runtimeTransports = transports.map((transport) =>
      transport({
        ...parameters,
        retryCount: 0,
      }),
    )
    const cooldownUntil = new Array(MEZO_MAINNET_RPC_ENDPOINTS.length).fill(0)

    const request: EIP1193RequestFn = async (args) => {
      const preference = readMezoMainnetRpcPreference()

      if (preference !== "auto") {
        const endpoint = getMezoMainnetRpcEndpoint(preference)
        const endpointIndex = Math.max(
          0,
          MEZO_MAINNET_RPC_ENDPOINTS.findIndex(
            (candidate) => candidate.id === endpoint.id,
          ),
        )
        publishActiveEndpoint(endpoint)
        return getArrayItem(runtimeTransports, endpointIndex).request(
          args,
        ) as never
      }

      const now = Date.now()
      const startIndex =
        cooldownUntil[activeAutoRpcIndex] <= now
          ? activeAutoRpcIndex
          : cooldownUntil.findIndex((cooldown) => cooldown <= now)
      const normalizedStartIndex =
        startIndex === -1 ? activeAutoRpcIndex : startIndex
      let lastError: unknown

      for (let offset = 0; offset < runtimeTransports.length; offset += 1) {
        const endpointIndex =
          (normalizedStartIndex + offset) % runtimeTransports.length
        const endpoint = getArrayItem(MEZO_MAINNET_RPC_ENDPOINTS, endpointIndex)

        if (
          (cooldownUntil[endpointIndex] ?? 0) > now &&
          offset < runtimeTransports.length - 1
        ) {
          continue
        }

        try {
          const result = await getArrayItem(
            runtimeTransports,
            endpointIndex,
          ).request(args)
          activeAutoRpcIndex = endpointIndex
          publishActiveEndpoint(endpoint)
          return result as never
        } catch (error) {
          lastError = error

          if (
            !isRetryableRpcError(error) ||
            offset === runtimeTransports.length - 1
          ) {
            throw error
          }

          cooldownUntil[endpointIndex] = Date.now() + RATE_LIMIT_COOLDOWN_MS
          activeAutoRpcIndex = (endpointIndex + 1) % runtimeTransports.length
          console.warn("[RPC] Rotating Mezo mainnet RPC endpoint", {
            failedEndpoint: endpoint.url,
            nextEndpoint: getArrayItem(
              MEZO_MAINNET_RPC_ENDPOINTS,
              activeAutoRpcIndex,
            ).url,
            error,
          })
        }
      }

      throw lastError
    }

    return {
      config: {
        key: "mezo-mainnet-rpc",
        name: "Mezo Mainnet RPC",
        request,
        retryCount: 0,
        type: "http",
      },
      request,
      value: {
        url: getArrayItem(MEZO_MAINNET_RPC_ENDPOINTS, activeAutoRpcIndex).url,
      },
    }
  }) as Transport
}
