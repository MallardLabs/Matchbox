import { getAddress } from "viem"
import { z } from "zod"
import { walletAddressSchema } from "../query/contracts"

const watchedWalletSchema = z.object({
  address: walletAddressSchema,
  label: z.string().trim().min(1).max(80),
})

const storedWalletStateSchema = z.object({
  version: z.literal(1),
  watchedWallets: z.array(watchedWalletSchema).max(25),
  activeWatchedAddress: walletAddressSchema.nullable(),
})

export type WatchedWallet = z.infer<typeof watchedWalletSchema>

export const walletStorageKey = "matchbox-pro:wallet-context:v1"

export function createWatchedWallet(input: {
  address: string
  label?: string
}): WatchedWallet {
  const address = getAddress(walletAddressSchema.parse(input.address.trim()))
  return watchedWalletSchema.parse({
    address,
    label: input.label?.trim() || `Watched ${shortenAddress(address)}`,
  })
}

export function parseStoredWalletState(
  raw: string | null,
): z.infer<typeof storedWalletStateSchema> {
  if (!raw) {
    return { version: 1, watchedWallets: [], activeWatchedAddress: null }
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    const result = storedWalletStateSchema.safeParse(parsed)
    return result.success
      ? result.data
      : { version: 1, watchedWallets: [], activeWatchedAddress: null }
  } catch {
    return { version: 1, watchedWallets: [], activeWatchedAddress: null }
  }
}

export function serializeWalletState(input: {
  watchedWallets: WatchedWallet[]
  activeWatchedAddress: string | null
}): string {
  return JSON.stringify(
    storedWalletStateSchema.parse({
      version: 1,
      ...input,
    }),
  )
}

export function upsertWatchedWallet(
  wallets: WatchedWallet[],
  wallet: WatchedWallet,
): WatchedWallet[] {
  const withoutDuplicate = wallets.filter(
    (item) => item.address.toLowerCase() !== wallet.address.toLowerCase(),
  )
  return [wallet, ...withoutDuplicate].slice(0, 25)
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
