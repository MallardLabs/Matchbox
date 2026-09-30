import {
  type NetworkSlug,
  networkForChainId,
} from "@repo/platform-contracts/network"
import { oidcLifetimes } from "@repo/platform-contracts/oidc"
import { isAddress, isAddressEqual, recoverMessageAddress } from "viem"
import { parseSiweMessage, validateSiweMessage } from "viem/siwe"
import type { SignerKind } from "./store/id-store"

/**
 * EIP-4361 checks before the (RPC-backed) signature verification: domain is
 * this host, URI is this origin, Mezo chain, fresh `issuedAt`, and an
 * `expirationTime` no more than 10 minutes out.
 */

const maxAgeMs = oidcLifetimes.siweNonce * 1000
const clockSkewMs = 60_000

export type SiweRejection =
  | "malformed"
  | "domain-mismatch"
  | "uri-mismatch"
  | "unsupported-chain"
  | "stale"
  | "expiry-invalid"
  | "not-yet-valid"

export type SiweCheckResult =
  | {
      ok: true
      address: `0x${string}`
      chainId: number
      network: NetworkSlug
      nonce: string
    }
  | { ok: false; reason: SiweRejection }

function originOf(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function checkSiweMessage(
  message: string,
  expected: { host: string; origin: string; now: Date },
): SiweCheckResult {
  let parsed: ReturnType<typeof parseSiweMessage>
  try {
    parsed = parseSiweMessage(message)
  } catch {
    return { ok: false, reason: "malformed" }
  }
  const { address, chainId, domain, nonce, uri, version, issuedAt } = parsed
  if (
    address === undefined ||
    !isAddress(address, { strict: false }) ||
    chainId === undefined ||
    domain === undefined ||
    nonce === undefined ||
    uri === undefined ||
    version !== "1" ||
    issuedAt === undefined
  ) {
    return { ok: false, reason: "malformed" }
  }
  if (domain !== expected.host) return { ok: false, reason: "domain-mismatch" }
  if (originOf(uri) !== expected.origin) {
    return { ok: false, reason: "uri-mismatch" }
  }
  const network = networkForChainId(chainId)
  if (network === null) return { ok: false, reason: "unsupported-chain" }

  const now = expected.now.getTime()
  const issued = issuedAt.getTime()
  if (issued > now + clockSkewMs || now - issued > maxAgeMs) {
    return { ok: false, reason: "stale" }
  }
  const expires = parsed.expirationTime?.getTime()
  if (
    expires === undefined ||
    expires <= now ||
    expires - now > maxAgeMs + clockSkewMs
  ) {
    return { ok: false, reason: "expiry-invalid" }
  }
  if (
    parsed.notBefore !== undefined &&
    parsed.notBefore.getTime() > now + clockSkewMs
  ) {
    return { ok: false, reason: "not-yet-valid" }
  }
  const valid = validateSiweMessage({
    message: parsed,
    domain: expected.host,
    nonce,
    time: expected.now,
  })
  if (!valid) return { ok: false, reason: "malformed" }
  return { ok: true, address, chainId, network, nonce }
}

/**
 * Classifies a signature that already verified for `address` on the SIWE
 * chain. If it ecrecovers to the address, whoever signed holds the key and
 * controls the address on every chain (`eoa`). Otherwise it verified through
 * ERC-1271 / ERC-6492 against that chain's contract state only (`contract`).
 */
export async function siweSignerKind(input: {
  message: string
  signature: `0x${string}`
  address: `0x${string}`
}): Promise<SignerKind> {
  try {
    const recovered = await recoverMessageAddress({
      message: input.message,
      signature: input.signature,
    })
    return isAddressEqual(recovered, input.address) ? "eoa" : "contract"
  } catch {
    // Not a 65-byte ECDSA signature (e.g. ERC-6492 wrapped, multisig).
    return "contract"
  }
}
