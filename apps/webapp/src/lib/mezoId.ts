import { getAddress, isAddress } from "viem"
import { z } from "zod"

export type MezoIdNetwork = "mainnet" | "testnet"

export type MezoIdQuery =
  | { kind: "mezo-id"; value: string }
  | { kind: "evm"; value: string }
  | { kind: "btc"; value: string }

export const MEZO_ACCOUNTS_API: Record<MezoIdNetwork, string> = {
  mainnet: "https://api.mezo.org",
  testnet: "https://api.testnet.mezo.org",
}

// P2PKH (1…), P2SH (3…), and bech32/bech32m (bc1…/tb1…).
const BTC_ADDRESS = /^(1|3|bc1|tb1)[a-zA-HJ-NP-Z0-9]{25,62}$/i
const BECH32_PREFIX = /^(bc1|tb1)/i
const MEZO_ID_NAME = /^[^\s/?#.]+$/

/**
 * Normalize user input into the exact key the Mezo accounts API indexes on.
 * The API is case-sensitive: EVM addresses must be checksummed, Mezo IDs and
 * bech32 addresses lowercase, and base58 addresses passed through untouched.
 * A bare name ("alice") is treated as a Mezo ID ("alice.mezo").
 */
export function parseMezoIdQuery(input: string): MezoIdQuery | null {
  const trimmed = input.trim()
  if (trimmed === "") return null

  if (/^0x/i.test(trimmed)) {
    if (!isAddress(trimmed, { strict: false })) return null
    return { kind: "evm", value: getAddress(trimmed) }
  }

  if (BTC_ADDRESS.test(trimmed)) {
    const value = BECH32_PREFIX.test(trimmed) ? trimmed.toLowerCase() : trimmed
    return { kind: "btc", value }
  }

  const name = trimmed.toLowerCase().replace(/\.mezo$/, "")
  if (!MEZO_ID_NAME.test(name)) return null
  return { kind: "mezo-id", value: `${name}.mezo` }
}

const upstreamAccountSchema = z.object({
  mezoId: z.string().nullish(),
  linkedAccounts: z
    .array(
      z.object({
        type: z.string(),
        evmAddress: z.string().nullish(),
        btcAddress: z.string().nullish(),
      }),
    )
    .nullish(),
})

const walletSchema = z.object({
  evmAddress: z
    .string()
    .refine((value) => isAddress(value, { strict: false }))
    .transform((value) => getAddress(value)),
  btcAddress: z.string().nullable(),
})

export type MezoIdWallet = z.infer<typeof walletSchema>

export const mezoIdLookupSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("found"),
    mezoId: z.string().nullable(),
    wallets: z.array(walletSchema),
  }),
  z.object({ status: z.literal("not-found") }),
  z.object({ status: z.literal("invalid") }),
])

export type MezoIdLookup = z.infer<typeof mezoIdLookupSchema>

/**
 * Collapse a raw `/accounts/{id}` response into the Mezo ID plus every
 * linked wallet with a valid EVM address (checksummed). Throws on an
 * unexpected shape.
 */
export function toMezoIdLookup(raw: unknown): MezoIdLookup {
  const account = upstreamAccountSchema.parse(raw)
  const wallets: MezoIdWallet[] = []
  for (const linked of account.linkedAccounts ?? []) {
    const evmAddress = linked.evmAddress
    if (!evmAddress || !isAddress(evmAddress, { strict: false })) continue
    wallets.push({
      evmAddress: getAddress(evmAddress),
      btcAddress: linked.btcAddress ?? null,
    })
  }
  return { status: "found", mezoId: account.mezoId ?? null, wallets }
}
