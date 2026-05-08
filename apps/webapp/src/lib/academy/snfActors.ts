import type { Address } from "viem"

/**
 * Addresses excluded from new-lock rewards (per Mezo Academy v3 brief: locks
 * created by SNF do not earn). Keep lowercase or rely on viem's getAddress
 * checksum at compare-time. Empty until we wire the real list.
 */
export const SNF_ACTORS: ReadonlyArray<Address> = []

export function isSnfActor(addr: Address | undefined): boolean {
  if (!addr) return false
  const lower = addr.toLowerCase()
  return SNF_ACTORS.some((a) => a.toLowerCase() === lower)
}
