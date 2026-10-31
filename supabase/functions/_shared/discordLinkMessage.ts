// The messages a wallet signs to link itself to, or unlink itself from, a
// Discord account. Each is deterministic given its inputs so the verifier can
// rebuild it from stored rows and compare it byte-for-byte.

import { getAddress } from "https://esm.sh/viem@2"
import { createSiweMessage } from "https://esm.sh/viem@2/siwe"

// Contract-wallet signatures are checked on Mezo mainnet, so the signed
// messages name that chain.
const SIGNING_CHAIN_ID = 31612

// The exact human-readable message the wallet signs to link.
export function buildLinkMessage(args: {
  domain: string
  discordUserId: string
  address: string
  nonce: string
  expiresAt: string
}): string {
  const checksummed = getAddress(args.address)
  return [
    `${args.domain} wants you to link your wallet to your Discord account.`,
    "",
    `Wallet: ${checksummed}`,
    `Discord User ID: ${args.discordUserId}`,
    `Nonce: ${args.nonce}`,
    `Expires: ${args.expiresAt}`,
    "",
    "Signing this message proves you own this wallet. It does not create a",
    "transaction or cost any gas.",
  ].join("\n")
}

// The EIP-4361 message a wallet signs to answer one unlink challenge. It names
// the webapp as its domain so wallets warn when another site asks for it, and
// carries the challenge's nonce and expiry so a signature works once, briefly.
// The Discord account stays out of the text: anyone can request a challenge
// for any wallet, and which Discord account a wallet belongs to is shown only
// to apps the member approves. The challenge row binds it instead.
export function buildUnlinkMessage(args: {
  webappUrl: string
  address: string
  nonce: string
  issuedAt: string
  expiresAt: string
}): string {
  return createSiweMessage({
    domain: new URL(args.webappUrl).host,
    address: getAddress(args.address),
    statement: "Unlink this wallet from its Discord account.",
    uri: args.webappUrl,
    version: "1",
    chainId: SIGNING_CHAIN_ID,
    nonce: args.nonce,
    issuedAt: new Date(args.issuedAt),
    expirationTime: new Date(args.expiresAt),
  })
}
