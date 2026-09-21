#!/usr/bin/env node
// Usage: node scripts/mezo-gauges-report.mjs [--at 2026-09-09T23:00:00Z]
//        [--base http://localhost:3000] [--md]

const args = process.argv.slice(2)
function flag(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const base = flag("--base", "http://localhost:3000")
const atArg = flag("--at", null)
const md = args.includes("--md")

const at = atArg ? Math.floor(new Date(atArg).getTime() / 1000) : null
if (atArg && !Number.isFinite(at)) {
  console.error(`Invalid --at value: ${atArg}`)
  process.exit(1)
}

const url = `${base}/api/mezo-gauges/snapshot${at !== null ? `?at=${at}` : ""}`
const res = await fetch(url)
if (!res.ok) {
  console.error(`Request failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}
const s = await res.json()

const e18 = (v) => (Number(BigInt(v) / 10n ** 14n) / 10000).toLocaleString()
const pct = (bps) => `${(Number(bps) / 100).toFixed(2)}%`
const iso = new Date(s.blockTimestamp * 1000).toISOString()

if (md) {
  console.log(
    `| time | block | totalWeight | totalVotingPower | participation | NFTs | wallets | topWallet | topShare | reconciled |`,
  )
  console.log("|---|---|---|---|---|---|---|---|---|---|")
  console.log(
    `| ${iso} | ${s.blockNumber} | ${e18(s.totalWeight)} | ${e18(s.totalVotingPower)} | ${pct(s.participationBps)} | ${s.votingNfts} | ${s.wallets} | ${s.topWallet?.owner ?? "-"} | ${s.topWallet ? pct(s.topWallet.shareBps) : "-"} | ${s.reconciled} |`,
  )
  process.exit(0)
}

console.log(`time:              ${iso}`)
console.log(`block:             ${s.blockNumber}`)
console.log(`epoch:             E${s.epochIndex} (start ${new Date(s.epochStart * 1000).toISOString()})`)
console.log(`totalWeight:       ${e18(s.totalWeight)} veMEZO`)
console.log(`totalVotingPower:  ${e18(s.totalVotingPower)} veMEZO`)
console.log(`participation:     ${pct(s.participationBps)}`)
console.log(`voting NFTs:       ${s.votingNfts}`)
console.log(`wallets:           ${s.wallets}`)
console.log(
  `top wallet:        ${s.topWallet?.owner ?? "-"} (${s.topWallet ? pct(s.topWallet.shareBps) : "-"})`,
)
console.log("gauge split:")
for (const g of s.gauges) {
  console.log(
    `  ${g.name.padEnd(18)} ${e18(g.weight).padStart(16)} veMEZO  ${pct(g.shareBps).padStart(7)}  ${g.isAlive ? "alive" : "dead"}`,
  )
}
console.log(`reconciled:        ${s.reconciled} (diff ${s.reconciliationDiff})`)
