import {
  type Abi,
  type AbiEvent,
  type Address,
  type Hex,
  encodeAbiParameters,
  encodeEventTopics,
} from "viem"
import { describe, expect, it } from "vitest"
import boostVoterAbi from "../../src/decode/abis/boost-voter"
import bribeVotingRewardAbi from "../../src/decode/abis/bribe-voting-reward"
import gaugeAbi from "../../src/decode/abis/gauge"
import poolsVoterAbi from "../../src/decode/abis/pools-voter"
import votingEscrowAbi from "../../src/decode/abis/voting-escrow"
import {
  MAXTIME,
  POKE_SELECTOR,
  WEEK,
  ZERO_ADDRESS,
} from "../../src/decode/constants"
import { lockKeysForLog } from "../../src/decode/dispatch"
import { compareRows } from "../../src/decode/parity"
import { type LogWithTx, projectBlock } from "../../src/decode/projection"
import { InMemoryStore } from "../../src/decode/store"

const VE_MEZO: Address = "0xb90fdad3dfd180458d62cc6acedc983d78e20122"
const BOOST_VOTER: Address = "0x2ba614a598cffa5a19d683cdca97bac3a49313d1"
const POOLS_VOTER: Address = "0x48233ccc97b87ba93bca212cbee48e3210211f03"
const LEGACY_BRIBE: Address = "0x6f3e2afc81a8fd8e3490ddb032a91d339b371afb"
const ALICE: Address = "0x000000000000000000000000000000000000a11c"
const BOB: Address = "0x0000000000000000000000000000000000000b0b"
const KEEPER: Address = "0x000000000000000000000000000000000000beef"
const START = 8_000_000n
const T0 = 1_780_000_000n
const DAY = 86_400n

let logIndex = 0

// Encodes one event as a raw log, as ingest would store it.
function entry(
  abi: Abi,
  eventName: string,
  args: Record<string, unknown>,
  options: {
    address: Address
    block: bigint
    timestamp: bigint
    from?: Address
    input?: Hex
  },
): LogWithTx {
  const event = abi.find(
    (item): item is AbiEvent =>
      item.type === "event" && item.name === eventName,
  )
  if (event === undefined) throw new Error(`No event ${eventName}`)
  const topics = encodeEventTopics({ abi: [event], eventName, args })
  const dataInputs = event.inputs.filter((input) => !input.indexed)
  const data = encodeAbiParameters(
    dataInputs,
    dataInputs.map((input) => args[input.name ?? ""]),
  )
  logIndex += 1
  const txHash: Hex = `0x${logIndex.toString(16).padStart(64, "0")}`
  return {
    log: {
      network: "mezo",
      blockNumber: options.block,
      blockHash: `0x${"ab".repeat(32)}`,
      blockTimestamp: options.timestamp,
      txHash,
      txIndex: 0,
      logIndex,
      address: options.address,
      topics: topics.filter((topic): topic is Hex => topic !== null),
      data,
    },
    tx: {
      network: "mezo",
      hash: txHash,
      blockNumber: options.block,
      txIndex: 0,
      from: options.from ?? ALICE,
      to: options.address,
      input: options.input ?? "0x12345678",
    },
  }
}

function at(day: bigint, address: Address = VE_MEZO) {
  return { address, block: START + day, timestamp: T0 + day * DAY }
}

function only(store: InMemoryStore, suffix: string) {
  const matches = [...store.activities.values()].filter((a) =>
    a.id.endsWith(suffix),
  )
  expect(matches).toHaveLength(1)
  const [activity] = matches
  if (activity === undefined) throw new Error(`no ${suffix}`)
  return activity
}

describe("voting escrow lock state", () => {
  it("tracks prev/post across a lock's lifecycle like the subgraph", () => {
    const store = new InMemoryStore()
    const lockEnd = T0 + 2n * 365n * DAY
    projectBlock(
      [
        entry(
          votingEscrowAbi,
          "Transfer",
          { from: ZERO_ADDRESS, to: ALICE, tokenId: 1n },
          at(0n),
        ),
        entry(
          votingEscrowAbi,
          "Deposit",
          {
            provider: ALICE,
            tokenId: 1n,
            depositType: 1,
            value: 100n,
            locktime: lockEnd,
            ts: T0,
          },
          at(0n),
        ),
      ],
      store,
    )
    const created = only(store, "-LOCK_CREATED")
    expect(created.prevAmount).toBe(0n)
    expect(created.prevDuration).toBe(0n)
    expect(created.postAmount).toBe(100n)
    expect(created.postDuration).toBe(lockEnd - T0)
    expect(created.duration).toBe(lockEnd)
    expect(store.locks.get(`${VE_MEZO}-1`)?.owner).toBe(ALICE)
    // Mints are not LOCK_TRANSFERRED rows.
    expect(
      [...store.activities.keys()].some((id) =>
        id.endsWith("-LOCK_TRANSFERRED"),
      ),
    ).toBe(false)

    projectBlock(
      [
        entry(
          votingEscrowAbi,
          "Deposit",
          {
            provider: ALICE,
            tokenId: 1n,
            depositType: 2,
            value: 50n,
            locktime: lockEnd,
            ts: T0 + DAY,
          },
          at(1n),
        ),
      ],
      store,
    )
    const increased = only(store, "-LOCK_AMOUNT_INCREASED")
    expect(increased.prevAmount).toBe(100n)
    expect(increased.prevDuration).toBe(lockEnd - (T0 + DAY))
    expect(increased.postAmount).toBe(150n)

    // Extend past MAXTIME: remaining duration is capped.
    const farEnd = T0 + 5n * 365n * DAY
    projectBlock(
      [
        entry(
          votingEscrowAbi,
          "Deposit",
          {
            provider: ALICE,
            tokenId: 1n,
            depositType: 3,
            value: 0n,
            locktime: farEnd,
            ts: T0 + 2n * DAY,
          },
          at(2n),
        ),
      ],
      store,
    )
    const extended = only(store, "-LOCK_EXTENDED")
    expect(extended.postDuration).toBe(MAXTIME)
    expect(store.locks.get(`${VE_MEZO}-1`)?.lastExtendedAt).toBe(T0 + 2n * DAY)

    projectBlock(
      [
        entry(
          votingEscrowAbi,
          "LockPermanent",
          { _owner: ALICE, _tokenId: 1n, amount: 150n, _ts: T0 + 3n * DAY },
          at(3n),
        ),
      ],
      store,
    )
    const permanent = only(store, "-LOCK_PERMANENT")
    expect(permanent.duration).toBe(MAXTIME)
    expect(permanent.postIsPermanent).toBe(true)
    expect(permanent.postDuration).toBe(MAXTIME)

    const unlockTs = T0 + 4n * DAY
    projectBlock(
      [
        entry(
          votingEscrowAbi,
          "UnlockPermanent",
          { _owner: ALICE, _tokenId: 1n, amount: 150n, _ts: unlockTs },
          at(4n),
        ),
      ],
      store,
    )
    const unlocked = only(store, "-LOCK_PERMANENT_UNLOCKED")
    const rebuiltEnd = ((unlockTs + MAXTIME) / WEEK) * WEEK
    expect(unlocked.prevIsPermanent).toBe(true)
    expect(unlocked.postIsPermanent).toBe(false)
    expect(unlocked.postDuration).toBe(rebuiltEnd - unlockTs)

    // Token 2, then merge 2 into 1.
    const secondEnd = T0 + 300n * DAY
    projectBlock(
      [
        entry(
          votingEscrowAbi,
          "Transfer",
          { from: ZERO_ADDRESS, to: ALICE, tokenId: 2n },
          at(5n),
        ),
        entry(
          votingEscrowAbi,
          "Deposit",
          {
            provider: ALICE,
            tokenId: 2n,
            depositType: 1,
            value: 40n,
            locktime: secondEnd,
            ts: T0 + 5n * DAY,
          },
          at(5n),
        ),
      ],
      store,
    )
    const mergeTs = T0 + 6n * DAY
    projectBlock(
      [
        entry(
          votingEscrowAbi,
          "Merge",
          {
            _sender: ALICE,
            _from: 2n,
            _to: 1n,
            _amountFrom: 40n,
            _amountTo: 150n,
            _amountFinal: 190n,
            _locktime: rebuiltEnd,
            _ts: mergeTs,
          },
          at(6n),
        ),
      ],
      store,
    )
    const merged = only(store, "-LOCK_MERGED")
    expect(merged.tokenId).toBe(1n)
    expect(merged.amount).toBe(40n)
    expect(merged.prevAmount).toBe(40n)
    expect(merged.prevDuration).toBe(secondEnd - mergeTs)
    expect(merged.postAmount).toBe(190n)
    expect(merged.postDuration).toBe(rebuiltEnd - mergeTs)
    expect(merged.mergeDestPrevAmount).toBe(150n)
    expect(merged.mergeSourceTokenId).toBe(2n)
    expect(store.locks.get(`${VE_MEZO}-2`)?.isMerged).toBe(true)

    // Secondary transfer, then withdraw. Withdraw keeps the stale unlockAt,
    // so postDuration stays positive, exactly as the subgraph computes it.
    projectBlock(
      [
        entry(
          votingEscrowAbi,
          "Transfer",
          { from: ALICE, to: BOB, tokenId: 1n },
          at(7n),
        ),
      ],
      store,
    )
    const transferred = only(store, "-LOCK_TRANSFERRED")
    expect(transferred.actor).toBe(BOB)
    expect(transferred.recipient).toBe(ALICE)

    const withdrawTs = T0 + 8n * DAY
    projectBlock(
      [
        entry(
          votingEscrowAbi,
          "Withdraw",
          { provider: BOB, tokenId: 1n, value: 190n, ts: withdrawTs },
          at(8n),
        ),
      ],
      store,
    )
    const withdrawn = only(store, "-LOCK_WITHDRAWN")
    expect(withdrawn.prevAmount).toBe(190n)
    expect(withdrawn.postAmount).toBe(0n)
    expect(withdrawn.postIsPermanent).toBe(false)
    expect(withdrawn.postDuration).toBe(rebuiltEnd - withdrawTs)
  })
})

describe("vote actor resolution", () => {
  it("credits poke votes to the lock owner and manual votes to the voter", () => {
    const store = new InMemoryStore()
    const gauge: Address = "0x00000000000000000000000000000000000aa0e0"
    projectBlock(
      [
        entry(
          votingEscrowAbi,
          "Transfer",
          { from: ZERO_ADDRESS, to: ALICE, tokenId: 7n },
          at(0n),
        ),
        entry(
          boostVoterAbi,
          "Voted",
          {
            voter: KEEPER,
            gauge,
            tokenId: 7n,
            weight: 5n,
            totalWeight: 9n,
            timestamp: T0,
          },
          { ...at(0n, BOOST_VOTER), from: KEEPER, input: `${POKE_SELECTOR}00` },
        ),
        entry(
          boostVoterAbi,
          "Voted",
          {
            voter: BOB,
            gauge,
            tokenId: 8n,
            weight: 3n,
            totalWeight: 12n,
            timestamp: T0,
          },
          { ...at(0n, BOOST_VOTER), from: BOB },
        ),
        entry(
          boostVoterAbi,
          "Abstained",
          {
            voter: ALICE,
            gauge,
            tokenId: 7n,
            weight: 5n,
            totalWeight: 7n,
            timestamp: T0,
          },
          { ...at(0n, BOOST_VOTER), from: ALICE },
        ),
      ],
      store,
    )
    const votes = [...store.activities.values()].filter(
      (a) => a.actionType === "BOOST_VOTE",
    )
    expect(votes.map((v) => v.actor)).toEqual([ALICE, BOB])
    expect(votes[0]?.txFrom).toBe(KEEPER)
    const vote = store.votes.get(`${BOOST_VOTER}-7-${gauge}`)
    expect(vote?.isActive).toBe(false)
    expect(vote?.currentWeight).toBe(0n)
  })
})

describe("data source activation", () => {
  it("ignores core contracts before the subgraph start block", () => {
    const store = new InMemoryStore()
    const early = entry(
      votingEscrowAbi,
      "Transfer",
      { from: ALICE, to: BOB, tokenId: 3n },
      { address: VE_MEZO, block: 7_739_499n, timestamp: T0 },
    )
    expect(projectBlock([early], store)).toBe(0)
    expect(lockKeysForLog(early.log)).toEqual([])
  })

  it("covers a template's logs in its creation block, even before creation", () => {
    const store = new InMemoryStore()
    const gauge: Address = "0x00000000000000000000000000000000000000c1"
    const bribe: Address = "0x00000000000000000000000000000000000000c2"
    const fee: Address = "0x00000000000000000000000000000000000000c3"
    const pool: Address = "0x00000000000000000000000000000000000000c4"
    const stakeBefore = entry(
      gaugeAbi,
      "Deposit",
      { from: ALICE, to: ALICE, amount: 10n },
      at(0n, gauge),
    )
    const created = entry(
      poolsVoterAbi,
      "GaugeCreated",
      {
        poolFactory: ZERO_ADDRESS,
        votingRewardsFactory: ZERO_ADDRESS,
        gaugeFactory: ZERO_ADDRESS,
        pool,
        bribeVotingReward: bribe,
        feeVotingReward: fee,
        gauge,
        creator: ALICE,
      },
      at(0n, POOLS_VOTER),
    )
    const claim = entry(
      bribeVotingRewardAbi,
      "ClaimRewards",
      { from: BOB, reward: ZERO_ADDRESS, amount: 4n },
      at(0n, bribe),
    )
    expect(projectBlock([stakeBefore, created, claim], store)).toBe(3)
    expect(only(store, "-LP_STAKED").gauge).toBe(gauge)
    const claimed = only(store, "-VOTE_BRIBE_CLAIMED")
    expect(claimed.pool).toBe(pool)
    expect(claimed.gauge).toBe(gauge)

    // A gauge log in a later block from an unregistered address is skipped.
    const stranger = entry(
      gaugeAbi,
      "Deposit",
      { from: ALICE, to: ALICE, amount: 1n },
      at(1n, "0x00000000000000000000000000000000000000c9"),
    )
    expect(projectBlock([stranger], store)).toBe(0)
  })

  it("seeds legacy reward mappings from the generated table", () => {
    const store = new InMemoryStore()
    const notify = entry(
      bribeVotingRewardAbi,
      "NotifyReward",
      { from: ALICE, reward: ZERO_ADDRESS, epoch: 1n, amount: 9n },
      { address: LEGACY_BRIBE, block: 5_231_392n, timestamp: T0 },
    )
    expect(projectBlock([notify], store)).toBe(1)
    const incentive = only(store, "-INCENTIVE_ADDED")
    expect(incentive.pool).toBe("0x10906a9e9215939561597b4c8e4b98f93c02031a")
    expect(incentive.gauge).toBe("0x4887fa1c88f8927932e5e1545b3b29a1a29656e7")
    expect(store.rewardMappings.has(LEGACY_BRIBE)).toBe(true)
  })

  it("prefetches every escrow's lock for a vote", () => {
    const vote = entry(
      boostVoterAbi,
      "Voted",
      {
        voter: KEEPER,
        gauge: ZERO_ADDRESS,
        tokenId: 42n,
        weight: 1n,
        totalWeight: 1n,
        timestamp: T0,
      },
      at(0n, BOOST_VOTER),
    )
    expect(lockKeysForLog(vote.log)).toHaveLength(4)
    expect(lockKeysForLog(vote.log)[0]).toBe(`${VE_MEZO}-42`)
  })
})

describe("compareRows", () => {
  it("reports counts, missing and extra ids, and field differences", () => {
    const parity = compareRows(
      [
        { id: "a", actionType: "SWAP", amount: "1" },
        { id: "b", actionType: "SWAP", amount: "2" },
      ],
      [
        { id: "a", actionType: "SWAP", amount: "1" },
        { id: "c", actionType: "SWAP", amount: "3" },
      ],
    )
    expect(parity).toEqual([
      {
        actionType: "SWAP",
        explorer: 2,
        warehouse: 2,
        missingIds: ["b"],
        extraIds: ["c"],
        fieldDiffs: [],
      },
    ])
  })

  it("lists each differing field", () => {
    const [parity] = compareRows(
      [{ id: "a", actionType: "SWAP", amount: "1", actor: "0x1" }],
      [{ id: "a", actionType: "SWAP", amount: "2", actor: "0x1" }],
    )
    expect(parity?.fieldDiffs).toEqual([
      { id: "a", field: "amount", explorer: "1", warehouse: "2" },
    ])
  })
})

describe("undecodable logs", () => {
  it("skips a log whose topics do not fit the handler's event", () => {
    const store = new InMemoryStore()
    const transfer = entry(
      votingEscrowAbi,
      "Transfer",
      { from: ALICE, to: BOB, tokenId: 5n },
      at(0n),
    )
    // An ERC-20 style Transfer: same topic0, tokenId moved into data.
    const [topic0, from, to] = transfer.log.topics
    if (topic0 === undefined || from === undefined || to === undefined) {
      throw new Error("expected three topics")
    }
    const erc20Style: LogWithTx = {
      ...transfer,
      log: {
        ...transfer.log,
        topics: [topic0, from, to],
        data: encodeAbiParameters([{ type: "uint256" }], [5n]),
      },
    }
    expect(projectBlock([erc20Style], store)).toBe(0)
    expect(store.activities.size).toBe(0)
  })
})
