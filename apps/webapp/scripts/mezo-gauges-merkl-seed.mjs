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

async function main() {
  const client = createPublicClient({ transport: http(RPC_URL) })
  const latest = await client.getBlockNumber()
  const toBlock = latest - (latest % BUCKET)

  // binary search: last block at or before the scan floor timestamp
  const latestBlock = await client.getBlock({ blockTag: "latest" })
  let lo = 1n
  let hi = latest
  while (lo < hi) {
    const mid = (lo + hi) / 2n
    const b = await client.getBlock({ blockNumber: mid })
    if (Number(b.timestamp) <= SCAN_FROM_TS) lo = mid + 1n
    else hi = mid
    await sleep(150)
  }
  const fromBlock = lo - 1n
  console.log(`scanning ${REWARD_TOKEN} transfers ${fromBlock} → ${toBlock}`)

  const ranges = []
  for (let from = fromBlock; from <= toBlock; from += CHUNK) {
    ranges.push({
      from,
      to: from + CHUNK - 1n > toBlock ? toBlock : from + CHUNK - 1n,
    })
  }

  let distributed = 0n
  let claimed = 0n
  const claimants = new Set()
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batches = await Promise.all(
      ranges.slice(i, i + CONCURRENCY).map((r) => getLogs(client, r.from, r.to)),
    )
    for (const logs of batches) {
      for (const log of logs) {
        const sender = topicAddr(log.topics[1])
        const recipient = topicAddr(log.topics[2])
        const amount = BigInt(log.data)
        if (recipient === DISTRIBUTOR) distributed += amount
        if (sender === DISTRIBUTOR) {
          claimed += amount
          if (recipient !== ZERO) claimants.add(recipient)
        }
      }
    }
    process.stdout.write(
      `\r${Math.min(i + CONCURRENCY, ranges.length)}/${ranges.length} chunks`,
    )
  }
  console.log()

  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        block: toBlock.toString(),
        generatedAt: new Date().toISOString(),
        distributed: distributed.toString(),
        claimed: claimed.toString(),
        claimants: [...claimants],
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
