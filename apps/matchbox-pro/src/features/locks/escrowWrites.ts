import { BaseError, ContractFunctionRevertedError, type Hex } from "viem"

const tokenIdInput = [{ name: "_tokenId", type: "uint256" }] as const

function escrowError(name: string) {
  return { type: "error", name, inputs: [] } as const
}

// Write surface of the veMEZO/veBTC escrows (Velodrome v2 VotingEscrow),
// with its custom errors so viem can name a revert.
export const LOCK_ESCROW_ABI = [
  {
    type: "function",
    name: "lockPermanent",
    inputs: tokenIdInput,
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unlockPermanent",
    inputs: tokenIdInput,
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: tokenIdInput,
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "merge",
    inputs: [
      { name: "_from", type: "uint256" },
      { name: "_to", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferFrom",
    inputs: [
      { name: "_from", type: "address" },
      { name: "_to", type: "address" },
      { name: "_tokenId", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createLock",
    inputs: [
      { name: "_value", type: "uint256" },
      { name: "_lockDuration", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
  escrowError("AlreadyVoted"),
  escrowError("LockDurationNotInFuture"),
  escrowError("LockDurationTooLong"),
  escrowError("LockExpired"),
  escrowError("LockNotExpired"),
  escrowError("NotApprovedOrOwner"),
  escrowError("NotPermanentLock"),
  escrowError("PermanentLock"),
  escrowError("SameNFT"),
  escrowError("ZeroAddress"),
  escrowError("ZeroAmount"),
] as const

const FRIENDLY: Record<string, string> = {
  AlreadyVoted: "This lock has live votes. Reset its votes first.",
  LockDurationNotInFuture: "Pick a longer duration.",
  LockDurationTooLong: "That duration is longer than the escrow allows.",
  LockExpired: "This lock has expired.",
  LockNotExpired: "This lock hasn't expired yet.",
  NotApprovedOrOwner: "This wallet doesn't own the lock.",
  NotPermanentLock: "Auto max-lock is already off.",
  PermanentLock: "Disable Auto max-lock on this lock first.",
  SameNFT: "Pick a different lock.",
  ZeroAddress: "Enter a recipient address.",
  ZeroAmount: "Enter an amount.",
}

/** Names a known escrow revert in plain words; null for anything else. */
export function escrowErrorMessage(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null
  const reverted = error.walk(
    (inner) => inner instanceof ContractFunctionRevertedError,
  )
  if (!(reverted instanceof ContractFunctionRevertedError)) return null
  const name = reverted.data?.errorName
  return name ? (FRIENDLY[name] ?? null) : null
}

/** Rethrows known escrow reverts as readable errors; rejections pass through. */
export function withEscrowErrors(
  write: () => Promise<Hex>,
): () => Promise<Hex> {
  return async function writeWithEscrowErrors(): Promise<Hex> {
    try {
      return await write()
    } catch (error) {
      const message = escrowErrorMessage(error)
      if (message) throw new Error(message)
      throw error
    }
  }
}
