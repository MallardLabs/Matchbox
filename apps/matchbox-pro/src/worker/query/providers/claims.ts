import type { Address, ContractFunctionParameters } from "viem"
import type { ClaimSourceKind } from "../../../features/query/contract"
import { REWARD_ABI } from "./abis"
import { type MezoClient, bigintSchema, multicallParsed } from "./rpc"
import type { VotingDomain, WalletLock } from "./voting"

export type ClaimableEntry = {
  contract: Address
  token: Address
  symbol: string
  decimals: number
  earned: bigint
}

export type ClaimableLock = {
  source: Exclude<ClaimSourceKind, "collateral_surplus">
  voter: Address
  tokenId: bigint
  entries: ClaimableEntry[]
}

export function sourceForDomain(domain: VotingDomain): ClaimableLock["source"] {
  if (domain.branch === "boost") return "boost_bribes"
  if (domain.branch === "pools") return "pool_fees_bribes"
  return "validator_bribes"
}

/**
 * `earned(token, tokenId)` for every reward contract and token a voter has
 * ever listed, including killed gauges (they keep owed rewards).
 */
export async function loadClaimable(input: {
  client: MezoClient
  domain: VotingDomain
  locks: readonly WalletLock[]
}): Promise<ClaimableLock[]> {
  const rewardTokens = new Map<
    string,
    { contract: Address; token: Address; symbol: string; decimals: number }
  >()
  for (const target of input.domain.targets) {
    for (const incentive of target.incentives) {
      rewardTokens.set(
        `${incentive.contract.toLowerCase()}:${incentive.token.toLowerCase()}`,
        incentive,
      )
    }
  }
  const tokens = [...rewardTokens.values()]
  const queries = input.locks.flatMap((lock) =>
    tokens.map((token) => ({ lock, token })),
  )
  const earned = await multicallParsed(
    input.client,
    queries.map(
      (query): ContractFunctionParameters => ({
        address: query.token.contract,
        abi: REWARD_ABI,
        functionName: "earned",
        args: [query.token.token, query.lock.tokenId],
      }),
    ),
    bigintSchema,
  )
  const byLock = new Map<bigint, ClaimableEntry[]>()
  queries.forEach((query, index) => {
    const amount = earned[index] ?? 0n
    if (amount <= 0n) return
    const list = byLock.get(query.lock.tokenId) ?? []
    list.push({ ...query.token, earned: amount })
    byLock.set(query.lock.tokenId, list)
  })
  return [...byLock.entries()].map(([tokenId, entries]) => ({
    source: sourceForDomain(input.domain),
    voter: input.domain.voter,
    tokenId,
    entries,
  }))
}

/** Groups entries into the `(rewards[], tokens[][])` claim arguments. */
export function claimArguments(entries: readonly ClaimableEntry[]): {
  contracts: Address[]
  tokens: Address[][]
} {
  const grouped = new Map<string, { contract: Address; tokens: Address[] }>()
  for (const entry of entries) {
    const key = entry.contract.toLowerCase()
    const group = grouped.get(key) ?? { contract: entry.contract, tokens: [] }
    group.tokens.push(entry.token)
    grouped.set(key, group)
  }
  const groups = [...grouped.values()]
  return {
    contracts: groups.map((group) => group.contract),
    tokens: groups.map((group) => group.tokens),
  }
}
