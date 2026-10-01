import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { type Address, type Hex, isAddress, isHex } from "viem"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { OWNER_LOOKUP_ESCROWS } from "../../src/decode/constants"
import { detectPokeMethod } from "../../src/decode/helpers"
import { canonicalRow } from "../../src/decode/parity"
import { projectBlock } from "../../src/decode/projection"
import { ACTIVITY_FIELDS, type ActivityField } from "../../src/decode/rows"
import { InMemoryStore } from "../../src/decode/store"
import type { RawLog, RawTx } from "../../src/ingest/rpc"

// Real explorer rows (matchbox-explorer 3.4.0) with the log and transaction
// behind each, built by fixtures/build-fixtures.ts. Each log runs through the
// full dispatch path and must reproduce the explorer row field for field.

const hex = z.custom<Hex>((value) => typeof value === "string" && isHex(value))
const address = z.custom<Address>(
  (value) => typeof value === "string" && isAddress(value, { strict: false }),
)

const fixtureSchema = z.object({
  template: z
    .enum(["BribeVotingReward", "FeeVotingReward", "Gauge", "Pool"])
    .nullable(),
  log: z.object({
    blockNumber: z.string().transform(BigInt),
    blockHash: hex,
    blockTimestamp: z.string().transform(BigInt),
    txHash: hex,
    txIndex: z.number().int(),
    logIndex: z.number().int(),
    address,
    topics: z.array(hex),
    data: hex,
  }),
  tx: z.object({
    hash: hex,
    from: address,
    to: address.nullable(),
    input: hex,
  }),
  expected: z.record(z.string(), z.string().nullable()),
})

const fixtures = z
  .array(fixtureSchema)
  .parse(
    JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL("./fixtures/explorer-rows.json", import.meta.url),
        ),
        "utf8",
      ),
    ),
  )

// Fields that depend on lock history before this one log. The stateful
// lifecycle test and the full-replay parity check cover them.
const LOCK_STATE_FIELDS: ActivityField[] = [
  "prevAmount",
  "prevDuration",
  "prevIsPermanent",
  "postAmount",
  "postDuration",
  "postIsPermanent",
  "mergeDestPrevAmount",
  "mergeDestPrevDuration",
  "mergeDestPrevIsPermanent",
]

function ignoredFields(actionType: string | null): Set<ActivityField> {
  switch (actionType) {
    case "LOCK_CREATED":
    case "LOCK_TRANSFERRED":
      return new Set()
    case "LOCK_MERGED":
      return new Set([...LOCK_STATE_FIELDS, "duration"])
    case "LOCK_AMOUNT_INCREASED":
    case "LOCK_EXTENDED":
    case "LOCK_WITHDRAWN":
    case "LOCK_PERMANENT":
    case "LOCK_PERMANENT_UNLOCKED":
      return new Set(LOCK_STATE_FIELDS)
    default:
      return new Set()
  }
}

describe("explorer fixtures", () => {
  it("covers every action type the explorer recorded", () => {
    const types = new Set(fixtures.map((f) => f.expected.actionType))
    expect(types.size).toBeGreaterThanOrEqual(42)
  })

  it.each(
    fixtures.map((fixture) => [fixture.expected.id ?? "?", fixture] as const),
  )("reproduces %s", (_id, fixture) => {
    const store = new InMemoryStore()
    const expected = fixture.expected
    const log: RawLog = { network: "mezo", ...fixture.log }
    const tx: RawTx = {
      network: "mezo",
      hash: fixture.tx.hash,
      blockNumber: log.blockNumber,
      txIndex: log.txIndex,
      from: fixture.tx.from,
      to: fixture.tx.to,
      input: fixture.tx.input,
    }

    if (fixture.template !== null) {
      store.putDataSource({
        network: "mezo",
        address: log.address,
        template: fixture.template,
        createdBlock: 0n,
      })
      // Template reward contracts got their mapping from GaugeCreated.
      const isReward =
        fixture.template === "BribeVotingReward" ||
        fixture.template === "FeeVotingReward"
      const gauge = expected.gauge
      const pool = expected.pool
      if (isReward && gauge && pool && isAddress(gauge) && isAddress(pool)) {
        store.putRewardMapping({
          id: log.address,
          gaugeAddress: gauge,
          poolAddress: pool,
        })
      }
    }

    // Poke votes resolve the actor through the lock owner.
    const tokenId = expected.tokenId
    const actor = expected.actor
    if (
      detectPokeMethod(tx.input) !== null &&
      tokenId &&
      actor &&
      isAddress(actor) &&
      (expected.actionType === "BOOST_VOTE" ||
        expected.actionType === "BOOST_ABSTAIN")
    ) {
      store.putLock({
        id: `${OWNER_LOOKUP_ESCROWS[0]}-${tokenId}`,
        tokenId: BigInt(tokenId),
        contractAddress: OWNER_LOOKUP_ESCROWS[0],
        owner: actor,
        amount: 0n,
        unlockAt: null,
        createdAt: null,
        lastExtendedAt: null,
        withdrawnAt: null,
        isPermanent: false,
        isWithdrawn: false,
        isMerged: false,
        mergedIntoTokenId: null,
        mergedAt: null,
        boost: null,
        activityCount: 0n,
      })
    }

    projectBlock([{ log, tx }], store)
    const id = expected.id ?? ""
    const activity = store.activities.get(id)
    expect(activity, `no activity ${id}`).toBeDefined()
    if (activity === undefined) return

    const ours = canonicalRow(activity)
    const ignored = ignoredFields(expected.actionType ?? null)
    for (const [field] of ACTIVITY_FIELDS) {
      if (ignored.has(field)) continue
      expect({ field, value: ours[field] ?? null }).toEqual({
        field,
        value: expected[field] ?? null,
      })
    }
  })
})
