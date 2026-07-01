export const MEZO_MAINNET_RPC_ENDPOINTS = [
  {
    id: "internal",
    label: "Mezo internal",
    url: "https://rpc-internal.mezo.org",
  },
  {
    id: "boar",
    label: "Boar",
    url: "https://rpc-http.mezo.boar.network",
  },
  {
    id: "validationcloud",
    label: "Validation Cloud",
    url: "https://mainnet.mezo.public.validationcloud.io",
  },
  {
    id: "drpc",
    label: "dRPC",
    url: "https://mezo.drpc.org",
  },
] as const

export const MEZO_MAINNET_SERVER_RPC_ENDPOINTS = [
  ...MEZO_MAINNET_RPC_ENDPOINTS,
  {
    id: "imperator",
    label: "Imperator",
    url: "https://rpc_evm-mezo.imperator.co",
  },
] as const

export const CUSTOM_MEZO_MAINNET_RPC_ENDPOINT_ID = "custom"

export type MezoMainnetRpcBuiltInEndpoint =
  (typeof MEZO_MAINNET_RPC_ENDPOINTS)[number]
export type MezoMainnetRpcEndpointId = MezoMainnetRpcBuiltInEndpoint["id"]
export type MezoMainnetRpcCustomEndpoint = {
  id: typeof CUSTOM_MEZO_MAINNET_RPC_ENDPOINT_ID
  label: "Custom"
  url: string
}
export type MezoMainnetRpcEndpoint =
  | MezoMainnetRpcBuiltInEndpoint
  | MezoMainnetRpcCustomEndpoint
export type MezoMainnetRpcPreference =
  | "auto"
  | MezoMainnetRpcEndpointId
  | typeof CUSTOM_MEZO_MAINNET_RPC_ENDPOINT_ID
export type MezoMainnetRpcPreferenceChangeDetail = {
  preference: MezoMainnetRpcPreference
  customUrl?: string
}

export const MEZO_MAINNET_RPC_PREFERENCE_STORAGE_KEY =
  "matchbox-mainnet-rpc-preference"
export const MEZO_MAINNET_CUSTOM_RPC_URL_STORAGE_KEY =
  "matchbox-mainnet-custom-rpc-url"
export const MEZO_MAINNET_RPC_PREFERENCE_EVENT =
  "matchbox:mainnet-rpc-preference"
export const MEZO_MAINNET_RPC_ACTIVE_EVENT = "matchbox:mainnet-rpc-active"

export const DEFAULT_MEZO_TESTNET_RPC_URL =
  process.env.NEXT_PUBLIC_RPC_TESTNET_URL ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://rpc.test.mezo.org"

const DEFAULT_MAINNET_RPC_ENDPOINT = MEZO_MAINNET_RPC_ENDPOINTS[0]

export function isMezoMainnetRpcEndpointId(
  value: string | null | undefined,
): value is MezoMainnetRpcEndpointId {
  return MEZO_MAINNET_RPC_ENDPOINTS.some((endpoint) => endpoint.id === value)
}

export function normalizeMezoMainnetCustomRpcUrl(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null
    }

    if (url.username || url.password) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

export function getMezoMainnetRpcEndpoint(
  endpointId: MezoMainnetRpcEndpointId,
): MezoMainnetRpcBuiltInEndpoint {
  return (
    MEZO_MAINNET_RPC_ENDPOINTS.find((endpoint) => endpoint.id === endpointId) ??
    DEFAULT_MAINNET_RPC_ENDPOINT
  )
}

export function getMezoMainnetCustomRpcEndpoint(
  url: string,
): MezoMainnetRpcCustomEndpoint {
  return {
    id: CUSTOM_MEZO_MAINNET_RPC_ENDPOINT_ID,
    label: "Custom",
    url,
  }
}

export function getMezoMainnetRpcEndpointByUrl(
  url: string | null | undefined,
): MezoMainnetRpcBuiltInEndpoint | undefined {
  return MEZO_MAINNET_RPC_ENDPOINTS.find((endpoint) => endpoint.url === url)
}

export function isMezoMainnetRpcPreference(
  value: string | null | undefined,
): value is MezoMainnetRpcPreference {
  return (
    value === "auto" ||
    value === CUSTOM_MEZO_MAINNET_RPC_ENDPOINT_ID ||
    isMezoMainnetRpcEndpointId(value)
  )
}

export function readMezoMainnetRpcPreference(): MezoMainnetRpcPreference {
  if (typeof window === "undefined") {
    return "auto"
  }

  const saved = window.localStorage.getItem(
    MEZO_MAINNET_RPC_PREFERENCE_STORAGE_KEY,
  )

  return isMezoMainnetRpcPreference(saved) ? saved : "auto"
}

export function readMezoMainnetCustomRpcUrl(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  return normalizeMezoMainnetCustomRpcUrl(
    window.localStorage.getItem(MEZO_MAINNET_CUSTOM_RPC_URL_STORAGE_KEY),
  )
}

export function writeMezoMainnetCustomRpcUrl(url: string) {
  if (typeof window === "undefined") {
    return
  }

  const normalizedUrl = normalizeMezoMainnetCustomRpcUrl(url)
  if (!normalizedUrl) {
    return
  }

  window.localStorage.setItem(
    MEZO_MAINNET_CUSTOM_RPC_URL_STORAGE_KEY,
    normalizedUrl,
  )
}

export function writeMezoMainnetRpcPreference(
  preference: MezoMainnetRpcPreference,
  options: { customUrl?: string } = {},
) {
  if (typeof window === "undefined") {
    return
  }

  const customUrl = normalizeMezoMainnetCustomRpcUrl(options.customUrl)
  if (
    preference === CUSTOM_MEZO_MAINNET_RPC_ENDPOINT_ID &&
    customUrl !== null
  ) {
    writeMezoMainnetCustomRpcUrl(customUrl)
  }

  window.localStorage.setItem(
    MEZO_MAINNET_RPC_PREFERENCE_STORAGE_KEY,
    preference,
  )
  window.dispatchEvent(
    new CustomEvent(MEZO_MAINNET_RPC_PREFERENCE_EVENT, {
      detail: { preference, customUrl: customUrl ?? undefined },
    }),
  )
}

export function getInitialMezoMainnetRpcUrl(): string {
  const preference = readMezoMainnetRpcPreference()
  if (preference === CUSTOM_MEZO_MAINNET_RPC_ENDPOINT_ID) {
    return readMezoMainnetCustomRpcUrl() ?? DEFAULT_MAINNET_RPC_ENDPOINT.url
  }

  if (preference === "auto") {
    return DEFAULT_MAINNET_RPC_ENDPOINT.url
  }

  return getMezoMainnetRpcEndpoint(preference).url
}
