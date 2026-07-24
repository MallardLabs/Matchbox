import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { getMatchboxExplorerSubgraphUrl } from "@/lib/mezoActivity/dataSources"
import { voteNeedsPoke } from "@/utils/validatorVoting"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { z } from "zod"

const pokeStatusResponseSchema = z.object({
  data: z
    .object({
      lockPositions: z.array(
        z.object({
          tokenId: z.string(),
          lastVotingPowerChangeAt: z.string().nullable(),
        }),
      ),
      votes: z.array(
        z.object({
          tokenId: z.string(),
          lastUpdatedAt: z.string(),
        }),
      ),
    })
    .optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
})

const pokeStatusQuery = `
  query ValidatorPokeStatus(
    $lockIds: [ID!]!
    $tokenIds: [BigInt!]!
    $voterContract: Bytes!
  ) {
    lockPositions(where: { id_in: $lockIds }) {
      tokenId
      lastVotingPowerChangeAt
    }
    votes(
      first: 1000
      where: {
        voterContract: $voterContract
        tokenId_in: $tokenIds
        isActive: true
      }
    ) {
      tokenId
      lastUpdatedAt
    }
  }
`

type PokeStatusData = {
  voteNeedsPokeByToken: Map<string, boolean>
}

async function fetchPokeStatus(
  url: string,
  lockIds: string[],
  tokenIds: string[],
  voterContract: string,
): Promise<PokeStatusData> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: pokeStatusQuery,
      variables: { lockIds, tokenIds, voterContract },
    }),
  })
  if (!response.ok) {
    throw new Error(`Unable to check vote freshness (${response.status})`)
  }

  const parsed = pokeStatusResponseSchema.parse(await response.json())
  if (parsed.errors?.length) {
    throw new Error(parsed.errors.map((error) => error.message).join("; "))
  }
  if (!parsed.data) throw new Error("Vote freshness response had no data")

  const oldestActiveVoteByToken = new Map<string, bigint>()
  for (const vote of parsed.data.votes) {
    const updatedAt = BigInt(vote.lastUpdatedAt)
    const existing = oldestActiveVoteByToken.get(vote.tokenId)
    if (existing === undefined || updatedAt < existing) {
      oldestActiveVoteByToken.set(vote.tokenId, updatedAt)
    }
  }

  const voteNeedsPokeByToken = new Map<string, boolean>()
  for (const lock of parsed.data.lockPositions) {
    const voteUpdatedAt = oldestActiveVoteByToken.get(lock.tokenId)
    const votingPowerChangedAt = lock.lastVotingPowerChangeAt
      ? BigInt(lock.lastVotingPowerChangeAt)
      : undefined
    voteNeedsPokeByToken.set(
      lock.tokenId,
      voteNeedsPoke(votingPowerChangedAt, voteUpdatedAt),
    )
  }

  return { voteNeedsPokeByToken }
}

export default function useValidatorPokeStatus(tokenIds: bigint[]): {
  voteNeedsPokeByToken: Map<string, boolean>
  isLoading: boolean
  refetch: () => Promise<unknown>
} {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)
  const tokenIdStrings = useMemo(
    () => tokenIds.map((tokenId) => tokenId.toString()),
    [tokenIds],
  )
  const lockIds = useMemo(
    () =>
      tokenIdStrings.map(
        (tokenId) => `${contracts.veBTC.address.toLowerCase()}-${tokenId}`,
      ),
    [contracts.veBTC.address, tokenIdStrings],
  )
  const url = getMatchboxExplorerSubgraphUrl(chainId)
  const query = useQuery({
    queryKey: [
      "validator-poke-status",
      chainId,
      contracts.validatorsVoter.address,
      tokenIdStrings,
    ],
    queryFn: () =>
      fetchPokeStatus(
        url,
        lockIds,
        tokenIdStrings,
        contracts.validatorsVoter.address.toLowerCase(),
      ),
    enabled: isNetworkReady && tokenIds.length > 0,
    staleTime: 30_000,
    refetchInterval: 15_000,
  })

  return {
    voteNeedsPokeByToken:
      query.data?.voteNeedsPokeByToken ?? new Map<string, boolean>(),
    isLoading: query.isLoading,
    refetch: query.refetch,
  }
}
