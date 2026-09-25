import type { PublicClient } from "viem"

/** Mezo mainnet average block time in seconds. */
const SECONDS_PER_BLOCK = 3.84

type BlockInfo = {
  number: bigint
  timestamp: bigint
}

const memo = new Map<number, BlockInfo>()

async function getBlockInfo(
  client: PublicClient,
  blockNumber: bigint,
): Promise<BlockInfo> {
  const block = await client.getBlock({ blockNumber })
  return { number: block.number, timestamp: block.timestamp }
}

/**
 * Binary search for the latest block whose timestamp is <= `timestamp`,
 * seeded by the ~3.84s average block time. Memoised per timestamp.
 */
export async function findBlockAtOrBefore(
  client: PublicClient,
  timestamp: number,
): Promise<BlockInfo> {
  const cached = memo.get(timestamp)
  if (cached) return cached

  const latest = await client.getBlock({ blockTag: "latest" })
  const latestTs = Number(latest.timestamp)
  const latestNum = Number(latest.number)

  let lo = 1
  let hi = latestNum
  if (timestamp < latestTs) {
    const estimate =
      latestNum - Math.ceil((latestTs - timestamp) / SECONDS_PER_BLOCK)
    hi = Math.max(
      1,
      Math.min(latestNum, estimate + Math.ceil(estimate * 0.02) + 64),
    )
    lo = Math.max(1, estimate - Math.ceil(estimate * 0.05) - 64)
  }

  let best: BlockInfo | undefined
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const block = await getBlockInfo(client, BigInt(mid))
    if (Number(block.timestamp) <= timestamp) {
      best = block
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  if (!best) {
    throw new Error(`No block found at or before timestamp ${timestamp}`)
  }
  memo.set(timestamp, best)
  return best
}
