import { createSiweMessage } from "viem/siwe"

/** The statement every Matchbox ID sign-in message carries. */
export const siweStatement = "Sign in to Matchbox ID."

const messageLifetimeMs = 5 * 60_000

/**
 * The exact EIP-4361 text the SPA asks the wallet to sign. The Worker only
 * accepts this canonical form (`checkSiweMessage`).
 */
export function signInMessage(input: {
  host: string
  origin: string
  address: `0x${string}`
  chainId: number
  nonce: string
  issuedAt: Date
}): string {
  return createSiweMessage({
    domain: input.host,
    address: input.address,
    statement: siweStatement,
    uri: input.origin,
    version: "1",
    chainId: input.chainId,
    nonce: input.nonce,
    issuedAt: input.issuedAt,
    expirationTime: new Date(input.issuedAt.getTime() + messageLifetimeMs),
  })
}
