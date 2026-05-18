import { type Address, getAddress, isAddressEqual } from "viem"

/**
 * Committed seed list of "system" addresses excluded from BOTH the lock and
 * vote tracks in the Academy simulator (treasuries, multisigs, automated
 * boosters, etc.). Entries here are authoritative — the UI can extend this
 * at runtime via localStorage but never remove a seed entry.
 *
 * Add new addresses as plain checksummed strings; viem's `getAddress` will
 * validate the checksum at module load time.
 */
export const BLACKLISTED_SYSTEM_ACTORS: ReadonlyArray<Address> = []

export function isBlacklistedSystemActor(addr: Address | undefined): boolean {
  if (!addr) return false
  try {
    const checksummed = getAddress(addr)
    return BLACKLISTED_SYSTEM_ACTORS.some((entry) =>
      isAddressEqual(entry, checksummed),
    )
  } catch {
    return false
  }
}
