---
title: MEZO gauges
description: How veMEZO holders direct the non-staking share of MEZO emissions to MUSD liquidity
---

# MEZO gauges

MEZO gauges are the votable targets of the veMEZO **ThirdPartyVoter**
(`0x2e6D2F2CaCC1d24F9f9358030674eB307397A6EB`). Each week, veMEZO NFT holders
vote to split the non-staking share of MEZO emissions across gauges that fund
MUSD liquidity on external venues:

| Gauge | Protocol | Chain |
|-------|----------|-------|
| USDC/MUSD | Aerodrome | Base |
| MEZO/MUSD | Aerodrome | Base |
| MUSD/USDC | Uniswap v4 | Ethereum |
| MUSD/USDC/USDT | Curve | Ethereum |

Vote windows follow the Thursday-aligned Mezo epoch clock and close at
Wednesday 23:00 UTC. Voting happens on
[mezo.org/earn/vote/mezo](https://mezo.org/earn/vote/mezo); the Matchbox
dashboard at [/mezo-gauges](/mezo-gauges) is read-only.

## What each dashboard section measures

- **Participation** — on-chain `totalWeight()` of the voter vs
  `totalVotingPower()` of veMEZO at the same block, cross-checked against the
  Goldsky `votes` table (`isActive: true`); a "reconciled" badge shows whether
  the two sums match exactly.
- **Epoch history** — snapshots at the 7 Sep baseline and each closed vote
  window, resolved to blocks by binary search and pinned to the same block for
  both on-chain and subgraph reads.
- **Gauges** — current on-chain `weights(gauge)` / `isAlive(gauge)`, MEZO
  distributed per gauge from `REWARD_DISTRIBUTED` subgraph events grouped by
  epoch, and current-epoch bribes from `gaugeToBribe` →
  `tokenRewardsPerEpoch`.
- **Destination liquidity** — Curve API (`getPools`/`getVolumes`), DefiLlama
  `yields.llama.fi/pools`, and on-chain Base `balanceOf` composition
  (slot0-priced fallback when DefiLlama has no pool row).
- **Merkl claims** — campaigns from `api.merkl.xyz/v4/campaigns`, and
  distributed/claimed computed from wrapped-veMEZO
  (`0x089A6af90041c3ac734cbdeFa84832Aa7fBF67C8`) Transfer logs to/from the
  Merkl Distributor (`0x3Ef3D8bA38eBe18Db133CeC108f4d14CE00dd9Ae`) on Mezo.
- **New veMEZO locks** — `LOCK_CREATED` events on the veMEZO escrow contract,
  bucketed by epoch week.

## Reproducing a snapshot

The report script prints the same figures from the command line against a
running dev server:

```bash
pnpm dev   # apps/webapp on :3000
node apps/webapp/scripts/mezo-gauges-report.mjs --at 2026-09-09T23:00:00Z
node apps/webapp/scripts/mezo-gauges-report.mjs --at 2026-09-09T23:00:00Z --md
```

Omit `--at` for the latest state; use `--base` to point at another host.
