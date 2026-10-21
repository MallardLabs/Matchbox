import type { NetworkSlug } from "@repo/platform-contracts/network"
import type {
  ChainSyncHealth,
  HealthStatus,
  PlatformHealthResponse,
  PlatformProduct,
  ProductHealth,
} from "@repo/platform-contracts/platform-health"
import type { StatusTone } from "../components/ui/Status"

export const healthTones: Record<HealthStatus, StatusTone> = {
  operational: "pos",
  degraded: "warn",
  down: "neg",
  unknown: "neutral",
}

export const healthLabels: Record<HealthStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
  unknown: "No data",
}

export function productHealth(
  health: PlatformHealthResponse | undefined,
  product: PlatformProduct,
): ProductHealth | null {
  return health?.products.find((item) => item.product === product) ?? null
}

export function chainHealth(
  health: PlatformHealthResponse | undefined,
  network: NetworkSlug,
): ChainSyncHealth | null {
  return health?.chainSync.find((item) => item.network === network) ?? null
}
