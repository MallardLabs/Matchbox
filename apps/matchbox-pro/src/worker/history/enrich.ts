import { parseAbi } from "viem"
import type { WireActivityItem } from "../../features/history/schema"
import {
  ESCROW_TOKENS,
  KNOWN_TOKENS,
  type TokenMeta,
  escrowOf,
} from "./activity"
import { asBigint, mezoHistoryClient, readAll } from "./chain"
import { boostBribes } from "./earnings"
import { sealedGet, sealedHas, sealedSet } from "./store"

// Fills what a source row can't say on its own: which escrow a lock row came
// from (the explorer omits the contract; the tx receipt has it) and the
// symbol/decimals of `amount` for tokens outside the core set. Both are
// immutable, so they're memoized forever. Lookups that fail stay null.

const MAX_RECEIPTS = 50

const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
])

function escrowKey(txHash: string, logIndex: number): string {
  return `escrow:${txHash}:${logIndex}`
}

async function resolveLockEscrows(items: WireActivityItem[]): Promise<void> {
  const pending = items.filter(
    (item) =>
      item.escrow === null &&
      item.actionType.startsWith("LOCK_") &&
      item.txHash !== null &&
      item.logIndex !== null,
  )
  const hashes = [
    ...new Set(
      pending.flatMap((item) =>
        item.txHash &&
        item.logIndex !== null &&
        !sealedHas(escrowKey(item.txHash, item.logIndex))
          ? [item.txHash]
          : [],
      ),
    ),
  ].slice(0, MAX_RECEIPTS)
  if (hashes.length > 0) {
    const rpc = mezoHistoryClient()
    const receipts = await Promise.all(
      hashes.map((hash) =>
        rpc
          .getTransactionReceipt({ hash: hash as `0x${string}` })
          .catch(() => undefined),
      ),
    )
    for (const receipt of receipts) {
      if (!receipt) continue
      for (const log of receipt.logs) {
        if (log.logIndex === null) continue
        sealedSet(
          escrowKey(receipt.transactionHash.toLowerCase(), log.logIndex),
          escrowOf("LOCK_", "", log.address.toLowerCase()),
        )
      }
    }
  }
  for (const item of pending) {
    if (!item.txHash || item.logIndex === null) continue
    const escrow = sealedGet<WireActivityItem["escrow"]>(
      escrowKey(item.txHash, item.logIndex),
    )
    if (escrow) item.escrow = escrow
  }
}

function tokenKey(token: string): string {
  return `token:${token}`
}

async function resolveTokens(tokens: readonly string[]): Promise<void> {
  const unknown = tokens.filter(
    (token) => !KNOWN_TOKENS[token] && !sealedHas(tokenKey(token)),
  )
  if (unknown.length === 0) return
  const fromTopology = new Map<string, TokenMeta>()
  for (const bribe of await boostBribes().catch(() => [])) {
    for (const token of bribe.tokens) {
      if (token.symbol !== "???") {
        fromTopology.set(token.token, {
          symbol: token.symbol,
          decimals: token.decimals,
        })
      }
    }
  }
  const onChain = unknown.filter((token) => !fromTopology.has(token))
  const reads = await readAll(
    onChain.flatMap((token) => [
      {
        address: token as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "symbol",
      },
      {
        address: token as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "decimals",
      },
    ]),
  ).catch(() => [])
  for (const token of unknown) {
    const known = fromTopology.get(token)
    if (known) {
      sealedSet(tokenKey(token), known)
      continue
    }
    const index = onChain.indexOf(token)
    const symbol = reads[index * 2]
    const decimals = asBigint(reads[index * 2 + 1])
    if (typeof symbol === "string" && decimals !== undefined) {
      sealedSet(tokenKey(token), { symbol, decimals: Number(decimals) })
    }
  }
}

function metaFor(item: WireActivityItem): TokenMeta | null {
  if (item.actionType.startsWith("LOCK_")) {
    return item.escrow ? ESCROW_TOKENS[item.escrow] : null
  }
  if (!item.token) return null
  return (
    KNOWN_TOKENS[item.token] ??
    sealedGet<TokenMeta>(tokenKey(item.token)) ??
    null
  )
}

/** Adds escrow and amount-token metadata in place; never throws. */
export async function enrichActivity(
  items: WireActivityItem[],
): Promise<WireActivityItem[]> {
  await Promise.all([
    resolveLockEscrows(items).catch(() => undefined),
    resolveTokens([
      ...new Set(items.flatMap((item) => (item.token ? [item.token] : []))),
    ]).catch(() => undefined),
  ])
  for (const item of items) {
    if (item.symbol !== null) continue
    const meta = metaFor(item)
    if (meta) {
      item.symbol = meta.symbol
      item.decimals = meta.decimals
    }
  }
  return items
}
