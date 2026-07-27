// Seeds `validator_profiles` with readable validator display names.
//
// The names are not derivable from anything else. `gauge_profiles` holds veBTC
// boost gauges only — no row there corresponds to a validator gauge — so there
// is nothing to copy from. The curated moniker -> display name mapping lives in
// ./validator-display-names.json and is the source of truth; edit that file to
// change a name or add a validator.
//
// This cannot be a plain SQL migration: `validator_profiles` is keyed by
// (chain_id, gauge_address) and requires an operator address, and the
// moniker/gauge/operator triple only exists on chain.
//
// Dry run by default; pass --apply to write.
//
//   pnpm backfill:validator-profiles -- --network mainnet
//   pnpm backfill:validator-profiles -- --network mainnet --apply
//
// Requires SUPABASE_SERVICE_ROLE_KEY: the anon role has INSERT/UPDATE revoked
// on validator_profiles.

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  CHAIN_ID,
  CONTRACTS,
  VALIDATORS_VOTER_ABI,
  VALIDATOR_POOL_ABI,
} from "@repo/shared/contracts"
import { createClient } from "@supabase/supabase-js"
import { http, createPublicClient, defineChain, getAddress } from "viem"

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const DEFAULT_RPC_URLS = {
  mainnet: "https://rpc-internal.mezo.org",
  testnet: "https://rpc.test.mezo.org",
}
const UPSERT_CHUNK_SIZE = 100

const here = path.dirname(fileURLToPath(import.meta.url))
const namesFile = path.join(here, "validator-display-names.json")

const args = process.argv.slice(2)
let network = "mainnet"
let rpcUrl = null
let apply = false
let overwrite = false

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]

  if (arg === "--network") {
    network = args[i + 1]
    i += 1
    continue
  }

  if (arg === "--rpc-url") {
    rpcUrl = args[i + 1]
    i += 1
    continue
  }

  if (arg === "--apply") {
    apply = true
    continue
  }

  if (arg === "--overwrite") {
    overwrite = true
    continue
  }

  console.error(
    "Usage: pnpm backfill:validator-profiles -- [--network mainnet|testnet] [--rpc-url <url>] [--apply] [--overwrite]",
  )
  process.exit(1)
}

if (network !== "mainnet" && network !== "testnet") {
  console.error(`Unsupported network "${network}" (use mainnet or testnet)`)
  process.exit(1)
}

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  console.error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)")
  process.exit(1)
}
if (!serviceRoleKey) {
  console.error(
    "Set SUPABASE_SERVICE_ROLE_KEY — anon cannot write validator_profiles",
  )
  process.exit(1)
}

// Monikers are compared lowercased; on-chain casing is inconsistent.
const displayNames = new Map(
  Object.entries(JSON.parse(readFileSync(namesFile, "utf8"))).map(
    ([moniker, name]) => [moniker.trim().toLowerCase(), name],
  ),
)

const chainId = CHAIN_ID[network]
const addresses = CONTRACTS[network]
const chain = defineChain({
  id: chainId,
  name: network === "mainnet" ? "Mezo Mainnet" : "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl ?? DEFAULT_RPC_URLS[network]] } },
})
const client = createPublicClient({
  chain,
  transport: http(rpcUrl ?? DEFAULT_RPC_URLS[network]),
})
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

/** Reads the validator registry and returns live gauge -> operator entries. */
async function readValidatorRegistry() {
  const operators = await client.readContract({
    address: addresses.validatorPool,
    abi: VALIDATOR_POOL_ABI,
    functionName: "validators",
  })

  const entries = await Promise.all(
    operators.map(async (operator) => {
      const [gauge, moniker] = await Promise.all([
        client
          .readContract({
            address: addresses.validatorsVoter,
            abi: VALIDATORS_VOTER_ABI,
            functionName: "validatorToGauge",
            args: [operator],
          })
          .catch(() => ZERO_ADDRESS),
        client
          .readContract({
            address: addresses.validatorPool,
            abi: VALIDATOR_POOL_ABI,
            functionName: "validator",
            args: [operator],
          })
          .then(([, description]) => description.moniker)
          .catch(() => ""),
      ])
      return { operator, gauge, moniker }
    }),
  )

  return entries.filter((entry) => entry.gauge !== ZERO_ADDRESS)
}

async function readValidatorProfiles() {
  const { data, error } = await supabase
    .from("validator_profiles")
    .select("*")
    .eq("chain_id", chainId)
  if (error) {
    throw new Error(`Unable to read validator_profiles: ${error.message}`)
  }

  const byGauge = new Map()
  for (const row of data ?? []) {
    byGauge.set(row.gauge_address.toLowerCase(), row)
  }
  return byGauge
}

function isBlank(value) {
  return value === null || value === undefined || value.trim() === ""
}

async function main() {
  console.log(
    `Seeding validator_profiles for ${network} (chain ${chainId})${
      apply ? "" : " — dry run, pass --apply to write"
    }`,
  )

  const [registry, existingProfiles] = await Promise.all([
    readValidatorRegistry(),
    readValidatorProfiles(),
  ])

  console.log(
    `${registry.length} live validator gauges, ${displayNames.size} curated names, ${existingProfiles.size} existing validator profiles`,
  )

  const pending = []
  const unmapped = []
  const untouched = []

  for (const entry of registry) {
    const displayName = displayNames.get(entry.moniker.trim().toLowerCase())
    if (!displayName) {
      unmapped.push(entry)
      continue
    }

    const gaugeKey = entry.gauge.toLowerCase()
    const existing = existingProfiles.get(gaugeKey)

    // Never clobber a name a validator set themselves unless asked to.
    if (existing && !overwrite && !isBlank(existing.display_name)) {
      untouched.push({ entry, existing })
      continue
    }
    if (existing?.display_name === displayName) continue

    pending.push({
      entry,
      displayName,
      isNew: !existing,
      row: {
        ...existing,
        chain_id: chainId,
        gauge_address: gaugeKey,
        operator_address: entry.operator.toLowerCase(),
        // No wallet authored this row; the edge service overwrites it on the
        // validator's first real edit.
        last_editor_address: existing?.last_editor_address ?? ZERO_ADDRESS,
        display_name: displayName,
        social_links: existing?.social_links ?? {},
        tags: existing?.tags ?? [],
      },
    })
  }

  for (const { entry, displayName, isNew } of pending) {
    console.log(
      `  ${isNew ? "create" : "update"} ${getAddress(entry.gauge)} ` +
        `${JSON.stringify(entry.moniker)} -> ${JSON.stringify(displayName)}`,
    )
  }

  for (const { entry, existing } of untouched) {
    console.log(
      `  keep   ${getAddress(entry.gauge)} ${JSON.stringify(entry.moniker)} ` +
        `already named ${JSON.stringify(existing.display_name)}`,
    )
  }

  if (unmapped.length > 0) {
    console.log(
      `\n${unmapped.length} validators have no curated name — add them to ${path.basename(namesFile)}:`,
    )
    for (const entry of unmapped) {
      console.log(
        `  skip   ${getAddress(entry.gauge)} ${JSON.stringify(entry.moniker)}`,
      )
    }
  }

  if (pending.length === 0) {
    console.log("\nNothing to seed.")
    return
  }

  if (!apply) {
    console.log(
      `\n${pending.length} rows would be written. Re-run with --apply.`,
    )
    return
  }

  for (let i = 0; i < pending.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = pending.slice(i, i + UPSERT_CHUNK_SIZE).map(({ row }) => row)
    const { error } = await supabase
      .from("validator_profiles")
      .upsert(chunk, { onConflict: "chain_id,gauge_address" })
    if (error) {
      throw new Error(`Upsert failed: ${error.message}`)
    }
  }

  console.log(`\nWrote ${pending.length} validator profiles.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
