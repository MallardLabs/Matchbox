// The EIP-4361 messages a wallet signs to link itself to, or unlink itself
// from, a Discord account. Each is deterministic given its inputs so the
// verifier can rebuild it from stored rows and compare it byte-for-byte.

import { getAddress } from "https://esm.sh/viem@2"
import { createSiweMessage } from "https://esm.sh/viem@2/siwe"

// Contract-wallet signatures are checked on Mezo mainnet, so the signed
// messages name that chain.
const SIGNING_CHAIN_ID = 31612

// Discord's current username rules, which also keep the EIP-4361 statement
// within its allowed characters. Older usernames that don't fit are left out
// and the account is named by its ID alone.
const DISCORD_USERNAME = /^[A-Za-z0-9_.]{2,32}$/

function discordAccount(args: {
  discordUserId: string
  discordUsername: string | null
}): string {
  if (!/^\d{1,20}$/.test(args.discordUserId)) {
    throw new Error("Invalid Discord user ID")
  }
  return args.discordUsername !== null &&
      DISCORD_USERNAME.test(args.discordUsername)
    ? `@${args.discordUsername} (ID ${args.discordUserId})`
    : `ID ${args.discordUserId}`
}

// The EIP-4361 message a wallet signs to link itself to the Discord account a
// link token was minted for. The webapp is its domain, so wallets warn when
// another site asks for it, and it names that Discord account so the signer
// can tell whose it is. The token's nonce and expiry keep it to one use.
export function buildLinkMessage(args: {
  webappUrl: string
  discordUserId: string
  discordUsername: string | null
  address: string
  nonce: string
  issuedAt: string
  expiresAt: string
}): string {
  const account = discordAccount(args)
  return createSiweMessage({
    domain: new URL(args.webappUrl).host,
    address: getAddress(args.address),
    statement:
      `Link this wallet to Discord account ${account}. ` +
      "Only sign if that Discord account is yours.",
    uri: `${args.webappUrl}/link`,
    version: "1",
    chainId: SIGNING_CHAIN_ID,
    nonce: args.nonce,
    issuedAt: new Date(args.issuedAt),
    expirationTime: new Date(args.expiresAt),
    resources: [`https://discord.com/users/${args.discordUserId}`],
  })
}

// The message a wallet signs to answer one unlink challenge. Like the link
// message it names the webapp as its domain, and it carries the challenge's
// nonce and expiry so a signature works once, briefly.
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
