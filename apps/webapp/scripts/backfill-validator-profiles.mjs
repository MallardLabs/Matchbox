// Backfills `validator_profiles` from the curated names in `gauge_profiles`.
//
// `validator_profiles` is keyed by (chain_id, gauge_address) and requires an
// operator address, neither of which `gauge_profiles` carries — so this cannot
// be a plain SQL migration. The gauge -> operator mapping only exists on chain,
// in ValidatorsVoter.validatorToGauge, so we read the registry first and join
// against it here.
//
// Dry run by default; pass --apply to write.
//
//   pnpm backfill:validator-profiles -- --network mainnet
//   pnpm backfill:validator-profiles -- --network mainnet --apply
//
// Requires SUPABASE_SERVICE_ROLE_KEY: the anon role has INSERT/UPDATE revoked
// on validator_profiles.

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
// Copied fields must exist on both tables. owner_address/vebtc_token_id are
// gauge-only, operator_address/chain_id are validator-only.
const COPIED_FIELDS = [
  "profile_picture_url",
  "display_name",
  "description",
  "website_url",
  "social_links",
  "incentive_strategy",
  "voting_strategy",
  "tags",
]
const UPSERT_CHUNK_SIZE = 100

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

/**
 * gauge_profiles predates address normalisation, so rows may hold checksummed
 * or lowercased addresses. Key everything lowercased and match on that.
 */
async function readGaugeProfiles() {
  const { data, error } = await supabase.from("gauge_profiles").select("*")
  if (error) throw new Error(`Unable to read gauge_profiles: ${error.message}`)

  const byGauge = new Map()
  for (const row of data ?? []) {
    byGauge.set(row.gauge_address.toLowerCase(), row)
  }
  return byGauge
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

function isEmpty(value) {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === "object") return Object.keys(value).length === 0
  return false
}

/** Normalises a gauge_profiles value into what validator_profiles expects. */
function normalize(field, value) {
  if (field === "social_links") return value ?? {}
  if (field === "tags") return value ?? []
  return value ?? null
}

function planRow(entry, legacy, existing) {
  const gaugeKey = entry.gauge.toLowerCase()
  const changedFields = []
  const row = {
    chain_id: chainId,
    gauge_address: gaugeKey,
    operator_address: entry.operator.toLowerCase(),
    // No wallet authored this row; the edge service overwrites it on first edit.
    last_editor_address: existing?.last_editor_address ?? ZERO_ADDRESS,
  }

  for (const field of COPIED_FIELDS) {
    const legacyValue = normalize(field, legacy[field])
    const existingValue = existing ? existing[field] : null

    // Never clobber what a validator saved themselves unless asked to.
    const keepExisting = !overwrite && !isEmpty(existingValue)
    if (keepExisting || isEmpty(legacyValue)) {
      row[field] = normalize(field, existingValue)
      continue
    }

    row[field] = legacyValue
    if (JSON.stringify(existingValue ?? null) !== JSON.stringify(legacyValue)) {
      changedFields.push(field)
    }
  }

  if (
    existing &&
    existing.operator_address.toLowerCase() !== row.operator_address
  ) {
    changedFields.push("operator_address")
  }

  return { row, changedFields, isNew: !existing }
}

async function main() {
  console.log(
    `Backfilling validator_profiles for ${network} (chain ${chainId})${
      apply ? "" : " — dry run, pass --apply to write"
    }`,
  )

  const [registry, gaugeProfiles, validatorProfiles] = await Promise.all([
    readValidatorRegistry(),
    readGaugeProfiles(),
    readValidatorProfiles(),
  ])

  console.log(
    `${registry.length} live validator gauges, ${gaugeProfiles.size} gauge profiles, ${validatorProfiles.size} existing validator profiles`,
  )

  const pending = []
  const missing = []

  for (const entry of registry) {
    const gaugeKey = entry.gauge.toLowerCase()
    const legacy = gaugeProfiles.get(gaugeKey)
    if (!legacy) {
      missing.push(entry)
      continue
    }

    const planned = planRow(entry, legacy, validatorProfiles.get(gaugeKey))
    if (planned.changedFields.length === 0) continue
    pending.push({ entry, ...planned })
  }

  for (const { entry, row, changedFields, isNew } of pending) {
    console.log(
      `  ${isNew ? "create" : "update"} ${getAddress(entry.gauge)} ` +
        `${JSON.stringify(entry.moniker)} -> ${JSON.stringify(row.display_name)} ` +
        `[${changedFields.join(", ")}]`,
    )
  }

  if (missing.length > 0) {
    console.log(`\n${missing.length} validator gauges have no curated profile:`)
    for (const entry of missing) {
      console.log(
        `  skip   ${getAddress(entry.gauge)} ${JSON.stringify(entry.moniker)}`,
      )
    }
  }

  if (pending.length === 0) {
    console.log("\nNothing to backfill.")
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
