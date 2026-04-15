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
    id: "imperator",
    label: "Imperator",
    url: "https://rpc_evm-mezo.imperator.co",
  },
  {
    id: "drpc",
    label: "dRPC",
    url: "https://mezo.drpc.org",
  },
] as const

export type MezoMainnetRpcEndpoint = (typeof MEZO_MAINNET_RPC_ENDPOINTS)[number]
export type MezoMainnetRpcEndpointId = MezoMainnetRpcEndpoint["id"]
export type MezoMainnetRpcPreference = "auto" | MezoMainnetRpcEndpointId

export const MEZO_MAINNET_RPC_PREFERENCE_STORAGE_KEY =
  "matchbox-mainnet-rpc-preference"
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

export function getMezoMainnetRpcEndpoint(
  endpointId: MezoMainnetRpcEndpointId,
): MezoMainnetRpcEndpoint {
  return (
    MEZO_MAINNET_RPC_ENDPOINTS.find((endpoint) => endpoint.id === endpointId) ??
    DEFAULT_MAINNET_RPC_ENDPOINT
  )
}

export function getMezoMainnetRpcEndpointByUrl(
  url: string | null | undefined,
): MezoMainnetRpcEndpoint | undefined {
  return MEZO_MAINNET_RPC_ENDPOINTS.find((endpoint) => endpoint.url === url)
}

export function readMezoMainnetRpcPreference(): MezoMainnetRpcPreference {
  if (typeof window === "undefined") {
    return "auto"
  }

  const saved = window.localStorage.getItem(
    MEZO_MAINNET_RPC_PREFERENCE_STORAGE_KEY,
  )

  return saved === "auto" || isMezoMainnetRpcEndpointId(saved) ? saved : "auto"
}

export function writeMezoMainnetRpcPreference(
  preference: MezoMainnetRpcPreference,
) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(
    MEZO_MAINNET_RPC_PREFERENCE_STORAGE_KEY,
    preference,
  )
  window.dispatchEvent(
    new CustomEvent(MEZO_MAINNET_RPC_PREFERENCE_EVENT, {
      detail: { preference },
    }),
  )
}

export function getInitialMezoMainnetRpcUrl(): string {
  const preference = readMezoMainnetRpcPreference()
  if (preference === "auto") {
    return DEFAULT_MAINNET_RPC_ENDPOINT.url
  }

  return getMezoMainnetRpcEndpoint(preference).url
}
