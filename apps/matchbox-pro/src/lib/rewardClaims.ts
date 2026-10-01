import { type Hash, isHash } from "viem"

export type RewardClaim = {
  hash: Hash
  tokenId: string
  submittedAt: number
  status: "pending" | "confirmed" | "reverted"
}

export function reconcileRewardClaims(
  rows: RewardClaim[],
  receipts: Array<{ hash: Hash; status: RewardClaim["status"] }>,
): RewardClaim[] {
  return rows.map((row) => ({
    ...row,
    status:
      row.status === "pending"
        ? (receipts.find((receipt) => receipt.hash === row.hash)?.status ??
          row.status)
        : row.status,
  }))
}

export function readRewardClaims(value: string | null): RewardClaim[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (row): row is RewardClaim =>
        row &&
        typeof row.hash === "string" &&
        isHash(row.hash) &&
        typeof row.tokenId === "string" &&
        /^\d+$/.test(row.tokenId) &&
        typeof row.submittedAt === "number" &&
        Number.isFinite(row.submittedAt) &&
        ["pending", "confirmed", "reverted"].includes(row.status),
    )
  } catch {
    return []
  }
}

export function rewardClaimError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/reject|denied|4001/i.test(message))
    return "Signature declined. No claim was submitted. You can try again."
  return "The claim could not be submitted. Check your wallet activity before trying again."
}
