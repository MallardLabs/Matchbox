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
export const BLACKLISTED_SYSTEM_ACTORS: ReadonlyArray<Address> = [
  "0x965C18B6AC7D233C00C93c7C0039BEf6A6035D26",
  "0x4859C4FaD2BB8A93ec4Ad8c232DD280B80D84Ea8",
  "0x2Bc442310e6684c678E7B8498EfA8Aa3CBd7c44B",
  "0x35cf1381f056559299B6A4dC08f83833fab07946",
  "0x57DE1ae5933CA6e5C672f6a9E8967D5e2fbF21Cf",
  "0x075108F275Ed81c9CFc01065E6e50CEea81D6363",
]

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
