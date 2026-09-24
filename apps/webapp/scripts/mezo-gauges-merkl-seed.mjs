#!/usr/bin/env node
/**
 * Regenerates src/lib/mezoGauges/merkl-seed.json — cumulative wrapped-veMEZO
 * transfer totals at a recent block. The API route resumes scans from this
 * seed so cold serverless instances only scan a small delta instead of the
 * full history (which exceeds the function timeout).
 *
 * Runs at build time (webapp `prebuild`); exits 0 on failure so builds are
 * never blocked by RPC issues — a stale or absent seed just means the API
 * falls back to a full scan.
 */
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createPublicClient, http } from "viem"

const RPC_URL = process.env.MEZO_RPC_URL ?? "https://rpc-http.mezo.boar.network"
const REWARD_TOKEN = "0x089a6af90041c3ac734cbdefa84832aa7fbf67c8"
const DISTRIBUTOR = "0x3ef3d8ba38ebe18db133cec108f4d14ce00dd9ae"
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const ZERO = "0x0000000000000000000000000000000000000000"
const CHUNK = 10_000n
const CONCURRENCY = 5
const SCAN_FROM_TS = 1_786_022_400 // 6 Aug 2026 — verified transfer-free floor
const BUCKET = 50n

// Checkpoint timestamps: the 7 Sep baseline plus every epoch vote-window
// close (epochs start Thursday 00:00 UTC, windows close Wed 23:00 UTC).
// Historical `at=` queries resume from the nearest checkpoint instead of
// rescanning from SCAN_FROM_TS, which exceeds the function timeout.
const WEEK = 604_800
const LAUNCH_EPOCH_START = 1_788_393_600
const CLOSE_OFFSET = WEEK - 3_600
const BASELINE_TS = 1_788_787_200
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/mezoGauges/merkl-seed.json",
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const isRateLimited = (e) => /rate limit|429|too many requests/i.test(String(e))

async function getLogs(client, from, to, retries = 5) {
  try {
    return await client.request({
      method: "eth_getLogs",
      params: [
        {
          address: REWARD_TOKEN,
          topics: [TRANSFER_TOPIC],
          fromBlock: `0x${from.toString(16)}`,
          toBlock: `0x${to.toString(16)}`,
        },
      ],
    })
  } catch (error) {
    if (isRateLimited(error) && retries > 0) {
      await sleep(600 * (6 - retries))
      return getLogs(client, from, to, retries - 1)
    }
    throw error
  }
}

const topicAddr = (t) => (t ? `0x${t.slice(26).toLowerCase()}` : "")

// Checkpoint searches probe many of the same blocks; memoize timestamps so
// each getBlock happens once across all calls.
const blockTsCache = new Map()
async function blockTimestamp(client, blockNumber) {
  const cached = blockTsCache.get(blockNumber)
  if (cached !== undefined) return cached
  const b = await client.getBlock({ blockNumber })
  const ts = Number(b.timestamp)
  blockTsCache.set(blockNumber, ts)
  await sleep(100)
  return ts
}

async function findBlockAtOrBefore(client, timestamp) {
  const latest = await client.getBlockNumber()
  let lo = 1n
  let hi = latest
  while (lo < hi) {
    const mid = (lo + hi) / 2n
    if ((await blockTimestamp(client, mid)) <= timestamp) lo = mid + 1n
    else hi = mid
  }
  return lo - 1n
}

async function main() {
  const client = createPublicClient({ transport: http(RPC_URL) })
  const latest = await client.getBlockNumber()
  const toBlock = latest - (latest % BUCKET)

  const fromBlock = await findBlockAtOrBefore(client, SCAN_FROM_TS)
  console.log(`scanning ${REWARD_TOKEN} transfers ${fromBlock} → ${toBlock}`)

  // Checkpoint timestamps that have already passed.
  const now = Math.floor(Date.now() / 1000)
  const checkpointTs = [BASELINE_TS]
  for (
    let epochStart = LAUNCH_EPOCH_START;
    epochStart + CLOSE_OFFSET <= now;
    epochStart += WEEK
  ) {
    checkpointTs.push(epochStart + CLOSE_OFFSET)
  }
  const checkpoints = []
  for (const ts of checkpointTs) {
    const block = await findBlockAtOrBefore(client, ts)
    if (block > fromBlock && block < toBlock) {
      checkpoints.push({ timestamp: ts, block })
    }
  }
  console.log(`checkpoints: ${checkpoints.map((c) => c.block).join(", ")}`)

  const ranges = []
  for (let from = fromBlock; from <= toBlock; from += CHUNK) {
    ranges.push({
      from,
      to: from + CHUNK - 1n > toBlock ? toBlock : from + CHUNK - 1n,
    })
  }

  // Collect every transfer log once, then fold into cumulative totals at
  // each checkpoint block and at toBlock.
  const logs = []
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batches = await Promise.all(
      ranges.slice(i, i + CONCURRENCY).map((r) => getLogs(client, r.from, r.to)),
    )
    for (const batch of batches) logs.push(...batch)
    process.stdout.write(
      `\r${Math.min(i + CONCURRENCY, ranges.length)}/${ranges.length} chunks`,
    )
  }
  console.log()

  logs.sort((a, b) =>
    BigInt(a.blockNumber) < BigInt(b.blockNumber)
      ? -1
      : BigInt(a.blockNumber) > BigInt(b.blockNumber)
        ? 1
        : 0,
  )

  const state = () => ({ distributed: 0n, claimed: 0n, claimants: new Set() })
  const apply = (s, log) => {
    const sender = topicAddr(log.topics[1])
    const recipient = topicAddr(log.topics[2])
    const amount = BigInt(log.data)
    if (recipient === DISTRIBUTOR) s.distributed += amount
    if (sender === DISTRIBUTOR) {
      s.claimed += amount
      if (recipient !== ZERO) s.claimants.add(recipient)
    }
  }
  const emit = (s, block, timestamp) => ({
    block: block.toString(),
    ...(timestamp !== undefined ? { timestamp } : {}),
    distributed: s.distributed.toString(),
    claimed: s.claimed.toString(),
    claimants: [...s.claimants],
  })

  const running = state()
  const emitted = []
  let cursor = 0
  for (const cp of checkpoints) {
    while (
      cursor < logs.length &&
      BigInt(logs[cursor].blockNumber) <= cp.block
    ) {
      apply(running, logs[cursor])
      cursor += 1
    }
    emitted.push(emit(running, cp.block, cp.timestamp))
  }
  while (cursor < logs.length) {
    apply(running, logs[cursor])
    cursor += 1
  }

  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        ...emit(running, toBlock),
        generatedAt: new Date().toISOString(),
        checkpoints: emitted,
      },
      null,
      2,
    )}\n`,
  )
  console.log(`wrote ${OUT}`)
}

main().catch((error) => {
  console.warn(
    `seed generation failed (keeping existing seed): ${error instanceof Error ? error.message : error}`,
  )
  process.exit(0)
})
