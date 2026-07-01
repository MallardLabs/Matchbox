import {
  CUSTOM_MEZO_MAINNET_RPC_ENDPOINT_ID,
  MEZO_MAINNET_RPC_ACTIVE_EVENT,
  MEZO_MAINNET_RPC_ENDPOINTS,
  type MezoMainnetRpcEndpoint,
  getMezoMainnetCustomRpcEndpoint,
  getMezoMainnetRpcEndpoint,
  readMezoMainnetCustomRpcUrl,
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

function getEndpointLabel(endpointIndex: number): string {
  const endpoint = getArrayItem(MEZO_MAINNET_RPC_ENDPOINTS, endpointIndex)
  return `${endpoint.label} (${endpoint.url})`
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
    let customRuntimeTransport: (typeof runtimeTransports)[number] | undefined
    let customRuntimeTransportUrl: string | undefined

    const getCustomRuntimeTransport = (url: string) => {
      if (customRuntimeTransport && customRuntimeTransportUrl === url) {
        return customRuntimeTransport
      }

      customRuntimeTransport = http(url, {
        batch: true,
        fetchOptions: { cache: "no-store" },
        retryCount: 0,
      })({
        ...parameters,
        retryCount: 0,
      })
      customRuntimeTransportUrl = url
      return customRuntimeTransport
    }

    const request: EIP1193RequestFn = async (args) => {
      const preference = readMezoMainnetRpcPreference()

      if (preference === CUSTOM_MEZO_MAINNET_RPC_ENDPOINT_ID) {
        const customRpcUrl = readMezoMainnetCustomRpcUrl()
        if (customRpcUrl !== null) {
          try {
            const result =
              await getCustomRuntimeTransport(customRpcUrl).request(args)
            publishActiveEndpoint(getMezoMainnetCustomRpcEndpoint(customRpcUrl))
            return result as never
          } catch (error) {
            if (!isRetryableRpcError(error)) {
              throw error
            }

            console.warn("[RPC] Falling back from custom Mezo mainnet RPC", {
              failedEndpoint: customRpcUrl,
              error,
            })
          }
        }
      }

      if (
        preference !== "auto" &&
        preference !== CUSTOM_MEZO_MAINNET_RPC_ENDPOINT_ID
      ) {
        const endpoint = getMezoMainnetRpcEndpoint(preference)
        const preferredEndpointIndex = Math.max(
          0,
          MEZO_MAINNET_RPC_ENDPOINTS.findIndex(
            (candidate) => candidate.id === endpoint.id,
          ),
        )
        const now = Date.now()
        const endpointOrder =
          cooldownUntil[preferredEndpointIndex] <= now
            ? [
                preferredEndpointIndex,
                ...runtimeTransports
                  .map((_, index) => index)
                  .filter((index) => index !== preferredEndpointIndex),
              ]
            : [
                ...runtimeTransports
                  .map((_, index) => index)
                  .filter((index) => index !== preferredEndpointIndex),
                preferredEndpointIndex,
              ]

        let lastError: unknown

        for (let index = 0; index < endpointOrder.length; index += 1) {
          const endpointIndex = endpointOrder[index] ?? preferredEndpointIndex
          const candidateEndpoint = getArrayItem(
            MEZO_MAINNET_RPC_ENDPOINTS,
            endpointIndex,
          )

          if (
            (cooldownUntil[endpointIndex] ?? 0) > now &&
            index < endpointOrder.length - 1
          ) {
            continue
          }

          try {
            const result = await getArrayItem(
              runtimeTransports,
              endpointIndex,
            ).request(args)
            publishActiveEndpoint(candidateEndpoint)
            return result as never
          } catch (error) {
            lastError = error

            if (
              !isRetryableRpcError(error) ||
              index === endpointOrder.length - 1
            ) {
              throw error
            }

            cooldownUntil[endpointIndex] = Date.now() + RATE_LIMIT_COOLDOWN_MS
            console.warn("[RPC] Falling back from preferred Mezo mainnet RPC", {
              preferredEndpoint: getEndpointLabel(preferredEndpointIndex),
              failedEndpoint: candidateEndpoint.url,
              nextEndpoint: getEndpointLabel(
                endpointOrder[index + 1] ?? preferredEndpointIndex,
              ),
              error,
            })
          }
        }

        throw lastError
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
