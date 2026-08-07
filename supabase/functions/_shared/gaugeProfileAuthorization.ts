import {
  getAddress,
  type Address,
  type PublicClient,
} from "https://esm.sh/viem@2"

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

const OWNER_OF_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const

const TOKEN_TO_GAUGE_ABI = [
  {
    type: "function",
    name: "boostableTokenIdToGauge",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const

const OWNABLE_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const

export type GaugeControllerKind =
  | "direct-eoa"
  | "direct-contract"
  | "ownable-eoa"
  | "ownable-contract"

export type GaugeController = {
  chainId: 31611 | 31612
  gaugeAddress: Address
  veBtcTokenId: bigint
  nftOwnerAddress: Address
  controllerAddress: Address
  controllerKind: GaugeControllerKind
}

type ResolveGaugeControllerInput = {
  chainId: 31611 | 31612
  gaugeAddress: string
  veBtcTokenId: string
  veBtcAddress: Address
  boostVoterAddress: Address
}

async function hasContractCode(
  client: PublicClient,
  address: Address,
): Promise<boolean> {
  const code = await client.getCode({ address })
  return code !== undefined && code !== "0x"
}

export async function resolveGaugeController(
  client: PublicClient,
  input: ResolveGaugeControllerInput,
): Promise<GaugeController> {
  const gaugeAddress = getAddress(input.gaugeAddress)
  const veBtcTokenId = BigInt(input.veBtcTokenId)
  const [nftOwnerAddress, mappedGauge] = await Promise.all([
    client.readContract({
      address: input.veBtcAddress,
      abi: OWNER_OF_ABI,
      functionName: "ownerOf",
      args: [veBtcTokenId],
    }),
    client.readContract({
      address: input.boostVoterAddress,
      abi: TOKEN_TO_GAUGE_ABI,
      functionName: "boostableTokenIdToGauge",
      args: [veBtcTokenId],
    }),
  ])

  if (
    mappedGauge === ZERO_ADDRESS ||
    mappedGauge.toLowerCase() !== gaugeAddress.toLowerCase()
  ) {
    throw new Error("The veBTC token is not mapped to this gauge")
  }

  const normalizedNftOwner = getAddress(nftOwnerAddress)
  if (!(await hasContractCode(client, normalizedNftOwner))) {
    return {
      chainId: input.chainId,
      gaugeAddress,
      veBtcTokenId,
      nftOwnerAddress: normalizedNftOwner,
      controllerAddress: normalizedNftOwner,
      controllerKind: "direct-eoa",
    }
  }

  let ownableController: Address | undefined
  try {
    const owner = await client.readContract({
      address: normalizedNftOwner,
      abi: OWNABLE_ABI,
      functionName: "owner",
    })
    if (owner !== ZERO_ADDRESS && owner !== normalizedNftOwner) {
      ownableController = getAddress(owner)
    }
  } catch {
    // A contract can authorize itself through ERC-1271 without being Ownable.
  }

  if (!ownableController) {
    return {
      chainId: input.chainId,
      gaugeAddress,
      veBtcTokenId,
      nftOwnerAddress: normalizedNftOwner,
      controllerAddress: normalizedNftOwner,
      controllerKind: "direct-contract",
    }
  }

  return {
    chainId: input.chainId,
    gaugeAddress,
    veBtcTokenId,
    nftOwnerAddress: normalizedNftOwner,
    controllerAddress: ownableController,
    controllerKind: (await hasContractCode(client, ownableController))
      ? "ownable-contract"
      : "ownable-eoa",
  }
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export function profileWriteAuthorizationMessage(input: {
  operation: "upsert-profile" | "upload-avatar"
  chainId: 31611 | 31612
  gaugeAddress: string
  veBtcTokenId: string
  signerAddress: string
  nonce: string
  expiresAt: string
}): string {
  return [
    "Matchbox gauge profile authorization",
    `Action: ${input.operation}`,
    `Chain: ${input.chainId}`,
    `Gauge: ${input.gaugeAddress.toLowerCase()}`,
    `veBTC token: ${input.veBtcTokenId}`,
    `Signer: ${input.signerAddress.toLowerCase()}`,
    `Nonce: ${input.nonce}`,
    `Expires at: ${input.expiresAt}`,
    "This signature is gasless and cannot submit a transaction.",
  ].join("\n")
}

export function editorAuthorizationMessage(input: {
  action: "grant-editor" | "revoke-editor"
  chainId: 31611 | 31612
  gaugeAddress: string
  veBtcTokenId: string
  nftOwnerAddress: string
  controllerAddress: string
  editorAddress: string
  nonce: string
  expiresAt: string
}): string {
  return [
    "Matchbox gauge profile editor authorization",
    `Action: ${input.action}`,
    `Chain: ${input.chainId}`,
    `Gauge: ${input.gaugeAddress.toLowerCase()}`,
    `veBTC token: ${input.veBtcTokenId}`,
    `NFT owner: ${input.nftOwnerAddress.toLowerCase()}`,
    `Controller: ${input.controllerAddress.toLowerCase()}`,
    `Editor: ${input.editorAddress.toLowerCase()}`,
    `Nonce: ${input.nonce}`,
    `Expires at: ${input.expiresAt}`,
    "This signature only changes offchain Matchbox profile editing access.",
    "It cannot move funds, vote, or submit an onchain transaction.",
  ].join("\n")
}
