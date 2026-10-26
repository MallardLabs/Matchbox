import {
  type NetworkSlug,
  networkSlugSchema,
  readableNetworks,
} from "@repo/platform-contracts/network"
import { PlatformError } from "@repo/platform-server"
import type { RequestAuth } from "./auth"
import type { ApiContext } from "./context"

/** The verified key; `/v1` routes run after `authenticate`. */
export function requireAuth(c: ApiContext): RequestAuth {
  const auth = c.get("auth")
  if (auth === undefined) throw new PlatformError("internal_error")
  return auth
}

/** 403 unless `network` is one the API serves. Every key reads all of them. */
export function allowedNetwork(network: string): NetworkSlug {
  const parsed = networkSlugSchema.safeParse(network)
  if (!parsed.success) {
    throw new PlatformError("network_not_allowed", {
      message: `Unknown network. Use one of: ${readableNetworks.join(", ")}.`,
    })
  }
  return parsed.data
}
