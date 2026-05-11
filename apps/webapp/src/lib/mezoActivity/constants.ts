import { type Address, getAddress } from "viem"

export const MEZO_BOOST_POKE_CRON_ADDRESS: Address = getAddress(
  "0xf8176Df5B9FbCf0Ed38c06970371ba89B7701bBb",
)

export const KNOWN_AUTOMATED_ADDRESSES: ReadonlySet<Address> = new Set([
  MEZO_BOOST_POKE_CRON_ADDRESS,
])

export function isAutomatedAddress(value: Address | undefined): boolean {
  if (!value) return false
  try {
    return KNOWN_AUTOMATED_ADDRESSES.has(getAddress(value))
  } catch {
    return false
  }
}
