import { CONTRACTS } from "@repo/shared/contracts"
import { describe, expect, it } from "vitest"
import {
  type CallResult,
  type ChainGauge,
  type MarketClient,
  type MarketReadInput,
  createMarketReader,
  marketChunkSize,
  marketMaxInFlight,
} from "./reader"

const contracts = CONTRACTS.mainnet
const zero = "0x0000000000000000000000000000000000000000"

function address(id: number): string {
  return `0x${id.toString(16).padStart(40, "0")}`
}

function upper(value: string): string {
  return `0x${value.slice(2).toUpperCase()}`
}

function key(
  target: string,
  functionName: string,
  args: readonly unknown[] = [],
): string {
  const rendered = args.map((arg) => String(arg).toLowerCase()).join(",")
  return `${target.toLowerCase()}.${functionName}(${rendered})`
}

/** Answers calls from a table; anything not in it reverts. */
function createFakeChain() {
  const responses = new Map<string, unknown>()
  const calls: string[] = []
  const chunkSizes: number[] = []
  const blockNumbers = new Set<bigint>()
  const flight = { current: 0, max: 0 }
  const client: MarketClient = {
    async blockNumber() {
      return 777n
    },
    async multicall(batch, blockNumber) {
      chunkSizes.push(batch.length)
      blockNumbers.add(blockNumber)
      flight.current += 1
      flight.max = Math.max(flight.max, flight.current)
      await new Promise((resolve) => setTimeout(resolve, 1))
      flight.current -= 1
      return batch.map((call): CallResult => {
        const callKey = key(call.address, call.functionName, call.args)
        calls.push(callKey)
        return responses.has(callKey)
          ? { status: "success", result: responses.get(callKey) }
          : { status: "failure", error: new Error(`reverted ${callKey}`) }
      })
    },
  }
  function set(
    target: string,
    functionName: string,
    args: readonly unknown[],
    result: unknown,
  ) {
    responses.set(key(target, functionName, args), result)
  }
  function unset(
    target: string,
    functionName: string,
    args: readonly unknown[] = [],
  ) {
    responses.delete(key(target, functionName, args))
  }
  return { client, set, unset, calls, chunkSizes, blockNumbers, flight }
}

type FakeChain = ReturnType<typeof createFakeChain>

const epochNow = 1_792_627_200
const epochNext = epochNow + 604_800

const mezo = contracts.mezoToken.toLowerCase()
const musd = address(0x5d)
const btc = address(0xbc)

const boostGauge = {
  known: address(0xb1),
  resolved: address(0xb2),
  elsewhere: address(0xb3),
  killed: address(0xb4),
  killedUnknown: address(0xb5),
}
const beneficiary = {
  known: address(0xbe1),
  resolved: address(0xbe2),
  elsewhere: address(0xbe3),
  killed: address(0xbe4),
  killedUnknown: address(0xbe5),
}
const boostBribe = address(0xb1b)
const brokenBribe = address(0xb3b)
const emptyBribe = address(0xb4b)

const pool = address(0x91)
const ungaugedPool = address(0x92)
const poolGauge = address(0x9a1)
const poolBribe = address(0x9b1)
const poolFees = address(0x9f1)

const operator = address(0x0e1)
const validatorGauge = address(0x7a1)
const orphanValidatorGauge = address(0x7a2)
const validatorBribe = address(0x7b1)

const thirdPartyGauge = address(0x3a1)

function setRewards(
  chain: FakeChain,
  contract: string,
  amounts: Array<[token: string, current: bigint | null, next: bigint | null]>,
) {
  chain.set(contract, "rewardsListLength", [], BigInt(amounts.length))
  amounts.forEach(([token, current, next], index) => {
    chain.set(contract, "rewards", [BigInt(index)], upper(token))
    if (current !== null) {
      chain.set(contract, "tokenRewardsPerEpoch", [token, epochNow], current)
    }
    if (next !== null) {
      chain.set(contract, "tokenRewardsPerEpoch", [token, epochNext], next)
    }
  })
}

/** One of each case on every voter; see the tests for what each exercises. */
function createMarket(): FakeChain {
  const chain = createFakeChain()
  const boost = contracts.boostVoter
  chain.set(boost, "length", [], 5n)
  chain.set(boost, "totalWeight", [], 1_000n)
  Object.values(boostGauge).forEach((gauge, index) => {
    chain.set(boost, "gauges", [BigInt(index)], upper(gauge))
    chain.set(boost, "weights", [gauge], BigInt(index + 1) * 10n ** 18n)
  })
  chain.set(boost, "isAlive", [boostGauge.known], true)
  chain.set(boost, "isAlive", [boostGauge.resolved], true)
  chain.set(boost, "isAlive", [boostGauge.killed], false)
  chain.set(boost, "isAlive", [boostGauge.killedUnknown], false)
  chain.set(boost, "gaugeToBribe", [boostGauge.known], boostBribe)
  chain.set(boost, "gaugeToBribe", [boostGauge.resolved], zero)
  chain.set(boost, "gaugeToBribe", [boostGauge.elsewhere], brokenBribe)
  chain.set(boost, "gaugeToBribe", [boostGauge.killed], emptyBribe)
  for (const name of [
    "known",
    "resolved",
    "elsewhere",
    "killed",
    "killedUnknown",
  ] as const) {
    chain.set(
      boostGauge[name],
      "rewardsBeneficiary",
      [],
      upper(beneficiary[name]),
    )
  }
  chain.set(contracts.veBTC, "balanceOf", [beneficiary.resolved], 2n)
  chain.set(
    contracts.veBTC,
    "ownerToNFTokenIdList",
    [beneficiary.resolved, 0n],
    11n,
  )
  chain.set(
    contracts.veBTC,
    "ownerToNFTokenIdList",
    [beneficiary.resolved, 1n],
    12n,
  )
  chain.set(contracts.veBTC, "balanceOf", [beneficiary.elsewhere], 1n)
  chain.set(
    contracts.veBTC,
    "ownerToNFTokenIdList",
    [beneficiary.elsewhere, 0n],
    20n,
  )
  chain.set(contracts.veBTC, "balanceOf", [beneficiary.killedUnknown], 1n)
  chain.set(
    contracts.veBTC,
    "ownerToNFTokenIdList",
    [beneficiary.killedUnknown, 0n],
    30n,
  )
  chain.set(boost, "boostableTokenIdToGauge", [7n], upper(boostGauge.known))
  chain.set(boost, "boostableTokenIdToGauge", [13n], zero)
  chain.set(boost, "boostableTokenIdToGauge", [11n], zero)
  chain.set(boost, "boostableTokenIdToGauge", [12n], upper(boostGauge.resolved))
  chain.set(boost, "boostableTokenIdToGauge", [20n], address(0xdead))
  chain.set(boost, "getBoost", [7n], 1_500_000_000_000_000_000n)
  chain.set(boost, "getBoost", [12n], 2_000_000_000_000_000_000n)
  chain.set(boost, "getBoost", [40n], 1_000_000_000_000_000_000n)
  setRewards(chain, boostBribe, [
    [mezo, 100n, 0n],
    [musd, null, 5n],
  ])
  chain.set(emptyBribe, "rewardsListLength", [], 0n)

  const pools = contracts.poolsVoter
  chain.set(pools, "length", [], 2n)
  chain.set(pools, "totalWeight", [], 100n)
  chain.set(pools, "pools", [0n], pool)
  chain.set(pools, "pools", [1n], ungaugedPool)
  chain.set(pools, "gauges", [pool], upper(poolGauge))
  chain.set(pools, "gauges", [ungaugedPool], zero)
  chain.set(pools, "weights", [pool], 42n)
  chain.set(pool, "symbol", [], " vAMM-BTC/MUSD ")
  chain.set(pools, "isAlive", [poolGauge], true)
  chain.set(pools, "gaugeToBribe", [poolGauge], poolBribe)
  chain.set(pools, "gaugeToFees", [poolGauge], poolFees)
  setRewards(chain, poolBribe, [[musd, 7n, 0n]])
  setRewards(chain, poolFees, [
    [btc, 1n, 0n],
    [musd, 2n, 0n],
  ])

  const validators = contracts.validatorsVoter
  chain.set(validators, "length", [], 2n)
  chain.set(validators, "gauges", [0n], validatorGauge)
  chain.set(validators, "gauges", [1n], orphanValidatorGauge)
  chain.set(contracts.validatorPool, "validators", [], [upper(operator)])
  chain.set(validators, "validatorToGauge", [operator], validatorGauge)
  chain.set(
    contracts.validatorPool,
    "validator",
    [operator],
    [
      `0x${"ab".repeat(32)}`,
      {
        moniker: "  Node\u0000 One ",
        identity: "",
        website: "",
        securityContact: "",
        details: "",
      },
    ],
  )
  chain.set(validators, "isAlive", [validatorGauge], true)
  chain.set(validators, "isAlive", [orphanValidatorGauge], false)
  chain.set(validators, "weights", [validatorGauge], 9n)
  chain.set(validators, "weights", [orphanValidatorGauge], 0n)
  chain.set(validators, "gaugeToBribe", [validatorGauge], validatorBribe)
  chain.set(validators, "gaugeToBribe", [orphanValidatorGauge], zero)
  setRewards(chain, validatorBribe, [[mezo, 3n, 4n]])

  const thirdParty = contracts.thirdPartyVoter
  chain.set(thirdParty, "length", [], 1n)
  chain.set(thirdParty, "totalWeight", [], 0n)
  chain.set(thirdParty, "gauges", [0n], thirdPartyGauge)
  chain.set(thirdParty, "isAlive", [thirdPartyGauge], true)
  chain.set(thirdParty, "weights", [thirdPartyGauge], 0n)
  chain.set(thirdParty, "gaugeToBribe", [thirdPartyGauge], zero)

  chain.set(mezo, "symbol", [], "MEZO")
  chain.set(mezo, "decimals", [], 18)
  chain.set(musd, "symbol", [], "MUSD")
  chain.set(btc, "symbol", [], "BTC")
  chain.set(btc, "decimals", [], 18)
  return chain
}

const input: MarketReadInput = {
  blockNumber: 777n,
  epochStarts: [epochNow, epochNext],
  knownBoostTokens: new Map([
    // Confirmed by boostableTokenIdToGauge(7).
    [boostGauge.known, "7"],
    // Stale: token 13 maps nowhere, so the beneficiary scan finds 12.
    [boostGauge.resolved, "13"],
    [boostGauge.elsewhere, "not-a-token"],
    // Killing cleared the mapping, so the claim is kept unconfirmed.
    [boostGauge.killed, "40"],
  ]),
}

function gaugeAt(gauges: readonly ChainGauge[], gaugeAddress: string) {
  const gauge = gauges.find((entry) => entry.gaugeAddress === gaugeAddress)
  if (!gauge) throw new Error(`missing gauge ${gaugeAddress}`)
  return gauge
}

describe("createMarketReader", () => {
  it("reads every voter's gauges at the pinned block", async () => {
    const chain = createMarket()
    const reader = createMarketReader("mezo", chain.client)
    expect(await reader.blockNumber()).toBe(777n)
    const read = await reader.read(input)
    expect(read.network).toBe("mezo")
    expect(read.blockNumber).toBe(777n)
    expect(read.epochStarts).toEqual([epochNow, epochNext])
    expect(read.totalWeights).toEqual({
      boost: 1_000n,
      pools: 100n,
      validators: null,
      "third-party": 0n,
    })
    expect(read.gauges.map((gauge) => gauge.gaugeAddress)).toEqual([
      ...Object.values(boostGauge),
      poolGauge,
      validatorGauge,
      orphanValidatorGauge,
      thirdPartyGauge,
    ])
    expect([...chain.blockNumbers]).toEqual([777n])
  })

  it("links boost gauges to their veBTC lock", async () => {
    const chain = createMarket()
    const read = await createMarketReader("mezo", chain.client).read(input)
    expect(gaugeAt(read.gauges, boostGauge.known)).toMatchObject({
      isAlive: true,
      weight: 10n ** 18n,
      bribeContract: boostBribe,
      link: {
        voter: "boost",
        vebtcTokenId: "7",
        beneficiary: beneficiary.known,
        boost: 1_500_000_000_000_000_000n,
      },
    })
    expect(gaugeAt(read.gauges, boostGauge.resolved)).toMatchObject({
      bribeContract: null,
      rewards: [],
      link: {
        voter: "boost",
        vebtcTokenId: "12",
        beneficiary: beneficiary.resolved,
        boost: 2_000_000_000_000_000_000n,
      },
    })
    expect(gaugeAt(read.gauges, boostGauge.elsewhere)).toMatchObject({
      isAlive: null,
      link: { voter: "boost", vebtcTokenId: null, boost: null },
    })
    expect(gaugeAt(read.gauges, boostGauge.killed)).toMatchObject({
      isAlive: false,
      link: {
        voter: "boost",
        vebtcTokenId: "40",
        beneficiary: beneficiary.killed,
        boost: 1_000_000_000_000_000_000n,
      },
    })
    expect(gaugeAt(read.gauges, boostGauge.killedUnknown)).toMatchObject({
      isAlive: false,
      link: {
        voter: "boost",
        vebtcTokenId: null,
        beneficiary: beneficiary.killedUnknown,
      },
    })
    // Confirmed known tokens and killed gauges skip the beneficiary scan.
    expect(chain.calls).not.toContain(
      key(contracts.veBTC, "balanceOf", [beneficiary.known]),
    )
    expect(chain.calls).toContain(
      key(contracts.veBTC, "balanceOf", [beneficiary.resolved]),
    )
    expect(chain.calls).toContain(
      key(contracts.boostVoter, "boostableTokenIdToGauge", [7n]),
    )
    expect(chain.calls).not.toContain(
      key(contracts.boostVoter, "boostableTokenIdToGauge", [40n]),
    )
    expect(chain.calls).not.toContain(
      key(contracts.boostVoter, "getBoost", [13n]),
    )
    expect(chain.calls).not.toContain(
      key(contracts.veBTC, "balanceOf", [beneficiary.killedUnknown]),
    )
    expect(chain.calls).toContain(
      key(contracts.veBTC, "balanceOf", [beneficiary.elsewhere]),
    )
  })

  it("links pool, validator and third-party gauges", async () => {
    const chain = createMarket()
    const read = await createMarketReader("mezo", chain.client).read(input)
    expect(read.gauges.some((gauge) => gauge.gaugeAddress === zero)).toBe(false)
    expect(gaugeAt(read.gauges, poolGauge)).toMatchObject({
      isAlive: true,
      weight: 42n,
      bribeContract: poolBribe,
      link: {
        voter: "pools",
        poolAddress: pool,
        poolSymbol: "vAMM-BTC/MUSD",
        feesContract: poolFees,
      },
    })
    expect(gaugeAt(read.gauges, validatorGauge)).toMatchObject({
      isAlive: true,
      weight: 9n,
      link: {
        voter: "validators",
        operatorAddress: operator,
        moniker: "Node One",
      },
    })
    expect(gaugeAt(read.gauges, orphanValidatorGauge)).toMatchObject({
      isAlive: false,
      bribeContract: null,
      link: { voter: "validators", operatorAddress: null, moniker: null },
    })
    expect(gaugeAt(read.gauges, thirdPartyGauge)).toEqual({
      gaugeAddress: thirdPartyGauge,
      isAlive: true,
      weight: 0n,
      bribeContract: null,
      link: { voter: "third-party" },
      rewards: [],
    })
  })

  it("reads reward amounts per epoch and token metadata", async () => {
    const chain = createMarket()
    const read = await createMarketReader("mezo", chain.client).read(input)
    expect(gaugeAt(read.gauges, boostGauge.known).rewards).toEqual([
      {
        kind: "bribe",
        contract: boostBribe,
        token: mezo,
        amounts: [100n, 0n],
      },
      {
        kind: "bribe",
        contract: boostBribe,
        token: musd,
        amounts: [null, 5n],
      },
    ])
    expect(gaugeAt(read.gauges, poolGauge).rewards).toEqual([
      { kind: "bribe", contract: poolBribe, token: musd, amounts: [7n, 0n] },
      { kind: "fees", contract: poolFees, token: btc, amounts: [1n, 0n] },
      { kind: "fees", contract: poolFees, token: musd, amounts: [2n, 0n] },
    ])
    expect(gaugeAt(read.gauges, validatorGauge).rewards).toEqual([
      {
        kind: "bribe",
        contract: validatorBribe,
        token: mezo,
        amounts: [3n, 4n],
      },
    ])
    // rewardsListLength() reverted: the slot list is unknown.
    expect(gaugeAt(read.gauges, boostGauge.elsewhere).rewards).toEqual([])
    expect(gaugeAt(read.gauges, boostGauge.killed).rewards).toEqual([])
    expect(read.tokens).toEqual(
      new Map([
        [mezo, { symbol: "MEZO", decimals: 18 }],
        [musd, { symbol: "MUSD", decimals: null }],
        [btc, { symbol: "BTC", decimals: 18 }],
      ]),
    )
  })

  it("reads amounts for exactly the requested epochs", async () => {
    const chain = createMarket()
    const read = await createMarketReader("mezo", chain.client).read({
      ...input,
      epochStarts: [epochNext],
    })
    expect(gaugeAt(read.gauges, validatorGauge).rewards[0]?.amounts).toEqual([
      4n,
    ])
    await expect(
      createMarketReader("mezo", chain.client).read({
        ...input,
        epochStarts: [1.5],
      }),
    ).rejects.toThrow("Invalid epoch start")
  })

  it.each([
    ["boost", contracts.boostVoter, "length", []],
    ["boost", contracts.boostVoter, "gauges", [2n]],
    ["pools", contracts.poolsVoter, "length", []],
    ["pools", contracts.poolsVoter, "pools", [1n]],
    ["pools", contracts.poolsVoter, "gauges", [pool]],
    ["validators", contracts.validatorsVoter, "length", []],
    ["validators", contracts.validatorsVoter, "gauges", [0n]],
    ["validators", contracts.validatorPool, "validators", []],
    ["third-party", contracts.thirdPartyVoter, "length", []],
    ["third-party", contracts.thirdPartyVoter, "gauges", [0n]],
  ] as const)(
    "throws when the %s listing call %s.%s fails",
    async (_voter, target, functionName, args) => {
      const chain = createMarket()
      chain.unset(target, functionName, args)
      await expect(
        createMarketReader("mezo", chain.client).read(input),
      ).rejects.toThrow(/failed/)
    },
  )

  it("rejects when the RPC request itself fails", async () => {
    const chain = createMarket()
    const client: MarketClient = {
      blockNumber: chain.client.blockNumber,
      async multicall(calls, blockNumber) {
        if (calls.some((call) => call.functionName === "rewardsListLength")) {
          throw new Error("HTTP 502")
        }
        return chain.client.multicall(calls, blockNumber)
      },
    }
    await expect(
      createMarketReader("mezo", client).read(input),
    ).rejects.toThrow("HTTP 502")
  })

  it("chunks calls and caps requests in flight", async () => {
    const chain = createMarket()
    const count = 450
    chain.set(contracts.boostVoter, "length", [], BigInt(count))
    for (let index = 0; index < count; index += 1) {
      chain.set(
        contracts.boostVoter,
        "gauges",
        [BigInt(index)],
        address(0x10000 + index),
      )
    }
    const read = await createMarketReader("mezo", chain.client).read({
      ...input,
      knownBoostTokens: new Map(),
    })
    expect(
      read.gauges.filter((gauge) => gauge.link.voter === "boost"),
    ).toHaveLength(count)
    expect(Math.max(...chain.chunkSizes)).toBe(marketChunkSize)
    expect(chain.flight.max).toBeLessThanOrEqual(marketMaxInFlight)
    expect(chain.flight.max).toBeGreaterThan(1)
  })
})
