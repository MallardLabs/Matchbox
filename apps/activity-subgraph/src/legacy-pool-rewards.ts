import { Address } from "@graphprotocol/graph-ts"
import { BribeToPool } from "../generated/schema"

/**
 * Reward contracts belonging to pool gauges that were created before this
 * subgraph's startBlock.
 *
 * `BribeToPool` and the BribeVotingReward/FeeVotingReward dynamic datasources are
 * only created inside `handlePoolGaugeCreated`. Gauges from the original v2 pool
 * launch (~block 5231392) predate indexing, so their reward contracts were never
 * registered and every bribe posted to them was dropped on the floor — around
 * $10.9k of real incentives invisible to the activity feed, versus ~$352 that was
 * visible.
 *
 * These are listed as static datasources in the manifest so graph-node actually
 * subscribes to them, and the mapping each handler needs is seeded from this table
 * on first use. The set is closed: it can only ever describe gauges older than
 * startBlock, so nothing new belongs here.
 *
 * Entries are `[rewardContract, pool, gauge]`, lowercased.
 */
const LEGACY_POOL_REWARDS: string[][] = [
  // MUSD/mUSDT
  [
    "0x6f3e2afc81a8fd8e3490ddb032a91d339b371afb",
    "0x10906a9e9215939561597b4c8e4b98f93c02031a",
    "0x4887fa1c88f8927932e5e1545b3b29a1a29656e7",
  ],
  // mUSDC/mUSDT
  [
    "0xa908809b0602606f86a745e13296881a9b267462",
    "0x2a1ab0224a7a608d3a992cb15594a2934f74f4c0",
    "0x548289b8983398db857efbb1e0cec489d72a6355",
  ],
  // BTC/mxSolvBTC
  [
    "0x7c90026167ff9051fec3e14a5ec486e484722ded",
    "0x329d64572f8922c3fe90d23a3c74a360d8ea6235",
    "0x3aecbfc4aa3fc152fbefd427f87db1e97226dc20",
  ],
  // BTC/MUSD
  [
    "0x94a9a494872bf7231d8378d0aef7d32ba552e305",
    "0x52e604c44417233b6ccedddc0d640a405caacefb",
    "0x8be20a5ff57e381025ae5e3a121b697269569aaf",
  ],
  // mSolvBTC/MUSD
  [
    "0xa2e2f01f9342582557917d114cabcce4a26bb47f",
    "0x5cd2a025c001e07ae354a4c22c3009908de1ac59",
    "0xf93b51466519b7c9ca318f1bde0524530632af90",
  ],
  // mT/MUSD
  [
    "0xf4c0067b6a38ca5b28fb2c8e1d8a2a20d20d2af3",
    "0x6688f868e9c81ee671867e77fbc618bbea2e9782",
    "0x39e06c2a671a237897ccbf9166a136eb5bdda432",
  ],
  // mcbBTC/BTC
  [
    "0x0377249dd6916f335048c7cd5541022b6ec2185c",
    "0x72e6b3f126cf4f6c90c08114ac29038a0e269210",
    "0xf482d0edb24c888d63a031de71d963c4f4fa79e4",
  ],
  // mUSDC/MUSD
  [
    "0xf2b88ec68c8fbd5261c5483d1385c46dc7619589",
    "0xed812aec0fecc8fd882ac3eccc43f3aa80a6c356",
    "0x2945401f5e015a122b482de0ea5bf92c005c3c75",
  ],
  // BTC/mSolvBTC
  [
    "0x52a9a4310a1567ce828df137b2ead4883c0221cf",
    "0xf6f950485b0a65828f07581ca979ef1271778d6a",
    "0x0edca8717ab81363ff722ab7bd45060800632ec8",
  ],
]

/**
 * Resolve a reward contract to its pool and gauge, seeding the mapping for
 * pre-startBlock gauges the GaugeCreated handler never saw.
 *
 * Takes the raw Address so table lookups compare bytes rather than hex strings —
 * a string compare would hinge on the casing `toHexString()` happens to emit, and
 * a mismatch there would fail silently and reinstate the bug.
 *
 * Returns null for a contract this subgraph genuinely knows nothing about, which
 * keeps the existing "skip the event" behaviour for anything unexpected.
 */
export function resolveRewardMapping(
  rewardContract: Address,
): BribeToPool | null {
  // Same id derivation handlePoolGaugeCreated uses, so existing rows still hit.
  const id = rewardContract.toHexString()
  const existing = BribeToPool.load(id)
  if (existing != null) {
    return existing
  }

  for (let i = 0; i < LEGACY_POOL_REWARDS.length; i++) {
    const entry = LEGACY_POOL_REWARDS[i]
    if (!Address.fromString(entry[0]).equals(rewardContract)) {
      continue
    }

    // Address extends Bytes, so it satisfies the entity fields directly.
    const mapping = new BribeToPool(id)
    mapping.poolAddress = Address.fromString(entry[1])
    mapping.gaugeAddress = Address.fromString(entry[2])
    mapping.save()
    return mapping
  }

  return null
}
