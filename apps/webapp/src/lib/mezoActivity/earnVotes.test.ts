import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import {
  EarnSubgraphError,
  stakeEntityId,
  timeseriesToSeconds,
  tokenIdFromStakeId,
} from "@/lib/mezoEarn"
import { CHAIN_ID } from "@repo/shared/contracts"
import { getAddress } from "viem"
import {
  fetchEarnVoteActivity,
  mapEarnVoteToActivity,
  voteEventsQuery,
} from "./earnVotes"

const VE_MEZO = "0xb90fdad3dfd180458d62cc6acedc983d78e20122"
const VE_BTC = "0x3d4b1b884a7a1e59fe8589a3296ec8f8cbb6f279"
const BOOST_VOTER = "0x2ba614a598cffa5a19d683cdca97bac3a49313d1"
const POOLS_VOTER = "0x48233ccc97b87ba93bca212cbee48e3210211f03"
const THIRD_PARTY_VOTER = "0x2e6d2f2cacc1d24f9f9358030674eb307397a6eb"
const TX_HASH = `0x${"ab".repeat(32)}`
const GAUGE = "0x7d6704a168003187b44d7559601d68b530486045"
const VOTER = "0x8b95ab83d350b6ba7e352cdd77fbf8b8f30f8d57"
const OWNER = "0x58c6a45acfcc1fd0e5a103cab2cae00b0b188ec5"

function voteEvent(
  type: "Voted" | "Abstained",
  overrides: Partial<{
    id: string
    txHash: string
    votingContract: string
    tokenId: string
    timestamp: string
  }> = {},
) {
  return {
    id: overrides.id ?? "52429477531090945",
    voter: VOTER,
    timestamp: overrides.timestamp ?? "1790820050000000",
    txHash: overrides.txHash ?? TX_HASH,
    type,
    tokenId: overrides.tokenId ?? "2012",
    weight: "748083192683829375",
    totalWeight: "219167916242379033401",
    votingContract: { id: overrides.votingContract ?? BOOST_VOTER },
    gauge: { address: GAUGE },
  }
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

type Call = { url: string; query: string }

function mockFetch(
  handler: (call: Call) => { status?: number; body: unknown },
): Call[] {
  const calls: Call[] = []
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const call = {
      url: String(input),
      query: (JSON.parse(String(init?.body)) as { query: string }).query,
    }
    calls.push(call)
    const { status = 200, body } = handler(call)
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
  return calls
}

test("stake ids are unpadded hex token id plus lowercase escrow", () => {
  assert.equal(stakeEntityId(1n, VE_MEZO.toUpperCase()), `0x1-${VE_MEZO}`)
  assert.equal(tokenIdFromStakeId(`0x7dc-${VE_MEZO}`), 2012n)
  assert.equal(tokenIdFromStakeId("nope"), undefined)
})

test("timeseries microseconds and plain seconds both become seconds", () => {
  assert.equal(timeseriesToSeconds("1790820050000000"), 1790820050)
  assert.equal(timeseriesToSeconds("1700000000"), 1700000000)
  assert.equal(timeseriesToSeconds("x"), undefined)
})

test("Voted maps to a boost vote owned by the lock owner", () => {
  const item = mapEarnVoteToActivity(voteEvent("Voted"), OWNER)
  assert.ok(item)
  assert.equal(item.id, "earn-vote:52429477531090945")
  assert.equal(item.actionType, "boostVote")
  assert.equal(item.weight, 748083192683829375n)
  assert.equal(item.totalWeight, 219167916242379033401n)
  assert.equal(item.tokenId, 2012n)
  assert.equal(item.source, "api")
  assert.equal(item.boostContext, "mezoVeBtcPairBoost")
  assert.equal(item.contract, "boostVoter")
  assert.equal(item.txHash, TX_HASH)
  assert.equal(item.actorAddress, getAddress(OWNER))
  assert.equal(item.gaugeAddress, getAddress(GAUGE))
  assert.equal(item.timestamp, 1790820050)
})

test("Abstained without an owner falls back to the voter", () => {
  const item = mapEarnVoteToActivity(voteEvent("Abstained"), undefined)
  assert.equal(item?.actionType, "boostAbstain")
  assert.equal(item?.actorAddress, getAddress(VOTER))
})

test("a bad tx hash is dropped", () => {
  assert.equal(
    mapEarnVoteToActivity(voteEvent("Voted", { txHash: "0xbad" }), OWNER),
    undefined,
  )
})

test("filters run in the subgraph, timestamps in microseconds", () => {
  const query = voteEventsQuery({
    fromTimestamp: 1790000000,
    toTimestamp: 1790800000,
    first: 51,
    voters: [
      {
        source: "BOOST_VOTER",
        address: BOOST_VOTER,
        escrow: VE_MEZO,
        contract: "boostVoter",
        boostContext: "mezoVeBtcPairBoost",
      },
    ],
    type: "Voted",
    gauge: GAUGE.toUpperCase(),
    tokenIds: ["1", "2"],
    voter: VOTER,
  })
  assert.match(query, /timestamp_gte: "1790000000000000"/)
  assert.match(query, /timestamp_lte: "1790800000000000"/)
  assert.match(query, new RegExp(`votingContract_in: \\["${BOOST_VOTER}"\\]`))
  assert.match(query, /type: Voted/)
  assert.match(query, new RegExp(`gauge_: \\{ address: "${GAUGE}" \\}`))
  assert.match(query, /tokenId_in: \["1","2"\]/)
  assert.match(query, new RegExp(`voter: "${VOTER}"`))
  assert.match(query, /first: 51/)
})

test("owners are looked up in each voter's own escrow", async () => {
  const calls = mockFetch(({ query }) => {
    if (query.includes("voteEvents")) {
      return {
        body: {
          data: {
            voteEvents: [
              voteEvent("Voted", { id: "3", votingContract: POOLS_VOTER }),
              voteEvent("Voted", {
                id: "2",
                votingContract: THIRD_PARTY_VOTER,
              }),
            ],
          },
        },
      }
    }
    const escrow = query.includes(VE_BTC) ? VE_BTC : VE_MEZO
    return {
      body: {
        data: {
          stakes: [
            {
              id: `0x7dc-${escrow}`,
              staker: { id: escrow === VE_BTC ? OWNER : VOTER },
            },
          ],
        },
      },
    }
  })
  const items = await fetchEarnVoteActivity({
    chainId: CHAIN_ID.mainnet,
    fromTimestamp: 0,
    toTimestamp: 1790900000,
    limit: 10,
  })
  const stakeQueries = calls.filter((call) => call.query.includes("stakes"))
  assert.equal(stakeQueries.length, 2)
  assert.equal(items[0]?.contract, "poolsVoter")
  assert.equal(items[0]?.actorAddress, getAddress(OWNER))
  assert.equal(items[1]?.contract, "thirdPartyVoter")
  assert.equal(items[1]?.actorAddress, getAddress(VOTER))
})

test("actor scope queries the actor's NFTs and votes they sent", async () => {
  const calls = mockFetch(({ query }) => {
    if (query.includes("staker:")) {
      return {
        body: {
          data: { stakes: [{ id: `0x7dc-${VE_MEZO}`, token: VE_MEZO }] },
        },
      }
    }
    if (query.includes("voteEvents")) {
      return { body: { data: { voteEvents: [voteEvent("Voted")] } } }
    }
    return { body: { data: { stakes: [] } } }
  })
  const items = await fetchEarnVoteActivity({
    chainId: CHAIN_ID.mainnet,
    fromTimestamp: 0,
    toTimestamp: 1790900000,
    limit: 10,
    actor: OWNER,
  })
  const voteQueries = calls.filter((call) => call.query.includes("voteEvents"))
  assert.equal(voteQueries.length, 2)
  assert.ok(
    voteQueries.some((call) => call.query.includes(`voter: "${OWNER}"`)),
  )
  const byToken = voteQueries.find((call) => call.query.includes("tokenId_in"))
  assert.ok(byToken)
  assert.match(byToken.query, /tokenId_in: \["2012"\]/)
  // veMEZO NFTs only vote on the boost and third-party voters.
  assert.ok(byToken.query.includes(BOOST_VOTER))
  assert.ok(byToken.query.includes(THIRD_PARTY_VOTER))
  assert.ok(!byToken.query.includes(POOLS_VOTER))
  // The same event from both queries appears once, owned by the actor.
  assert.equal(items.length, 1)
  assert.equal(items[0]?.actorAddress, getAddress(OWNER))
})

test("a 429 is retried, then succeeds", async () => {
  let attempts = 0
  mockFetch(() => {
    attempts += 1
    return attempts === 1
      ? { status: 429, body: {} }
      : { body: { data: { voteEvents: [] } } }
  })
  const items = await fetchEarnVoteActivity({
    chainId: CHAIN_ID.mainnet,
    fromTimestamp: 0,
    toTimestamp: 1790900000,
    limit: 10,
  })
  assert.equal(attempts, 2)
  assert.deepEqual(items, [])
})

test("subgraph errors surface instead of returning empty", async () => {
  mockFetch(() => ({ body: { errors: [{ message: "boom" }] } }))
  await assert.rejects(
    fetchEarnVoteActivity({
      chainId: CHAIN_ID.mainnet,
      fromTimestamp: 0,
      toTimestamp: 1790900000,
      limit: 10,
    }),
    EarnSubgraphError,
  )
})

test("vote types and testnet short-circuit without a request", async () => {
  const calls = mockFetch(() => ({ body: { data: { voteEvents: [] } } }))
  assert.deepEqual(
    await fetchEarnVoteActivity({
      chainId: CHAIN_ID.mainnet,
      fromTimestamp: 0,
      toTimestamp: 1,
      limit: 10,
      actionTypes: ["LOCK_CREATED"],
    }),
    [],
  )
  assert.deepEqual(
    await fetchEarnVoteActivity({
      chainId: CHAIN_ID.testnet,
      fromTimestamp: 0,
      toTimestamp: 1,
      limit: 10,
    }),
    [],
  )
  assert.equal(calls.length, 0)
})
