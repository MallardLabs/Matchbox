import {
  type NetworkSlug,
  networkForChainId,
} from "@repo/platform-contracts/network"
import { oidcLifetimes } from "@repo/platform-contracts/oidc"
import {
  BaseError,
  ExecutionRevertedError,
  type Hex,
  encodeDeployData,
  erc6492SignatureValidatorAbi,
  erc6492SignatureValidatorByteCode,
  hashMessage,
  hexToBool,
  isAddress,
  isAddressEqual,
  recoverMessageAddress,
} from "viem"
import {
  type SiweMessage,
  createSiweMessage,
  parseSiweMessage,
  validateSiweMessage,
} from "viem/siwe"
import { siweStatement } from "../shared/siwe-message"
import type { ContractSignatureArgs, SiwePublicClient } from "./deps"

/**
 * EIP-4361 checks before the (RPC-backed) signature verification: the
 * canonical message the SPA builds, domain is this host, URI is this origin,
 * Mezo chain, fresh `issuedAt`, and an `expirationTime` no more than 10
 * minutes out.
 */

const maxAgeMs = oidcLifetimes.siweNonce * 1000
const clockSkewMs = 60_000

export type SiweRejection =
  | "malformed"
  | "non-canonical"
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

function isValidDate(value: Date | undefined): value is Date {
  return value !== undefined && Number.isFinite(value.getTime())
}

/**
 * viem's parser is lax (unanchored suffix, any address case, `new Date` on
 * any text), so the message must re-serialise to itself. Wallets only run
 * their SIWE domain check on EIP-4361 conforming text.
 */
function isCanonical(message: string, fields: SiweMessage): boolean {
  try {
    return createSiweMessage(fields) === message
  } catch {
    // Fields it refuses (domain, nonce or URI syntax) throw.
    return false
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
    !isValidDate(issuedAt) ||
    (parsed.expirationTime !== undefined &&
      !isValidDate(parsed.expirationTime)) ||
    (parsed.notBefore !== undefined && !isValidDate(parsed.notBefore))
  ) {
    return { ok: false, reason: "malformed" }
  }
  // The SPA's exact form: pinned statement; no scheme, request id or
  // resources.
  if (
    !isCanonical(message, {
      address,
      chainId,
      domain,
      nonce,
      uri,
      version,
      statement: siweStatement,
      issuedAt,
      expirationTime: parsed.expirationTime,
      notBefore: parsed.notBefore,
    })
  ) {
    return { ok: false, reason: "non-canonical" }
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
 * Local ECDSA check, no RPC. If the signature ecrecovers to `address`,
 * whoever signed holds the key and controls the address on every chain.
 */
export async function recoversToAddress(input: {
  message: string
  signature: `0x${string}`
  address: `0x${string}`
}): Promise<boolean> {
  try {
    const recovered = await recoverMessageAddress({
      message: input.message,
      signature: input.signature,
    })
    return isAddressEqual(recovered, input.address)
  } catch {
    // Not a 65-byte ECDSA signature (e.g. ERC-6492 wrapped, multisig).
    return false
  }
}

export type ContractSignatureCheck = {
  status: "valid" | "invalid" | "unavailable"
  /** RPCs that gave no answer: failed, timed out or serve another chain. */
  errors: unknown[]
}

/** The viem public client calls rpcSignatureClient makes. */
export type SignatureRpc = {
  getChainId(): Promise<number>
  call(args: { data: Hex }): Promise<{ data?: Hex | undefined }>
}

/**
 * ERC-1271 / ERC-6492 check through one RPC: the deployless ERC-6492
 * validator `eth_call` viem's `verifySiweMessage` makes. viem reads any
 * failed call (HTTP 5xx or 429, timeout) as "invalid", which let one flaky
 * RPC deny every contract sign-in. Here only the chain answers: the
 * validator's result, or its revert on a malformed signature. Anything else
 * throws.
 */
export function rpcSignatureClient(rpc: SignatureRpc): SiwePublicClient {
  return {
    getChainId: () => rpc.getChainId(),
    async isValidSignature({ message, signature, address }) {
      const data = encodeDeployData({
        abi: erc6492SignatureValidatorAbi,
        bytecode: erc6492SignatureValidatorByteCode,
        args: [address, hashMessage(message), signature],
      })
      let result: { data?: Hex | undefined }
      try {
        result = await rpc.call({ data })
      } catch (error) {
        const reverted =
          error instanceof BaseError &&
          error.walk((cause) => cause instanceof ExecutionRevertedError) !==
            null
        if (reverted) return false
        throw error
      }
      if (result.data === undefined) {
        throw new Error("Signature validator returned no data")
      }
      // One byte, 0x01 or 0x00; hexToBool throws on anything else.
      return hexToBool(result.data)
    },
  }
}

async function rpcAnswer(
  client: SiwePublicClient,
  args: ContractSignatureArgs,
  chainId: number,
): Promise<boolean> {
  const [servedChainId, valid] = await Promise.all([
    client.getChainId(),
    client.isValidSignature(args),
  ])
  if (servedChainId !== chainId) {
    throw new Error(`RPC serves chain ${servedChainId}, not ${chainId}`)
  }
  return valid
}

/**
 * ERC-1271 / ERC-6492 validity is an RPC's word about one chain's contract
 * state. When more than one RPC is configured, two must confirm it and none
 * may deny it. The primary is asked alone first: any denial is final, so a
 * forged signature costs one RPC call, and only a "valid" or no answer
 * brings in the confirming RPCs (one extra round trip for real contract
 * sign-ins).
 */
export async function verifyContractSignature(
  clients: readonly SiwePublicClient[],
  args: ContractSignatureArgs,
  chainId: number,
): Promise<ContractSignatureCheck> {
  const errors: unknown[] = []
  let confirmed = 0
  for (const round of [clients.slice(0, 1), clients.slice(1)]) {
    const answers = await Promise.allSettled(
      round.map((client) => rpcAnswer(client, args, chainId)),
    )
    let denied = false
    for (const answer of answers) {
      if (answer.status === "rejected") errors.push(answer.reason)
      else if (answer.value) confirmed += 1
      else denied = true
    }
    if (denied) return { status: "invalid", errors }
  }
  const required = clients.length > 1 ? 2 : 1
  return { status: confirmed >= required ? "valid" : "unavailable", errors }
}
