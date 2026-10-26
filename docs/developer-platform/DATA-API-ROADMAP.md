# Matchbox Data API roadmap: parity with the Matchbox UIs

Status: plan (2026-10-26). Goal: every number the Matchbox UIs show is
readable from `api.matchbox.markets`, so a third party can build a full
Matchbox UI on it, and "Matchbox Pro runs on the Matchbox API" is literally
true. Auth, keys, rate limiting and request logs are in `ARCHITECTURE.md`;
the warehouse is in `docs/goldsky-exit.md` and
`apps/matchbox-indexer/GO-LIVE.md`. This file replaces the "API / Interface
Changes" section of `docs/matchbox-pro/11-indexed-data-platform.md` (Pro
branch); §3 lists what changed.

## 0. Owner constraints

- Plain endpoints for every UI datum. Stuart and MCP consume the API later;
  they are never the only way to reach data.
- Free tiers. Neon Free: 100 CU-h a month, 0.25 CU fixed, 5-minute
  scale-to-zero that cannot be disabled (nonstop ≈ 180 CU-h). The indexer
  cron already uses ≈ 62–67 CU-h.
- **No API request reads Neon.** Current state comes from RPC snapshots taken
  by the API cron and stored in D1. History comes from the Neon warehouse,
  copied into D1 by the indexer at the end of each tick while Neon is awake.
- Cloudflare Workers Paid. D1 includes 25 B rows read, 50 M rows written and
  5 GB stored a month.
- One public API Worker: `apps/developer-api` (Hono, `RateLimiter` Durable
  Object, Supabase for keys and profiles). Every key reads `mezo` and
  `mezo-testnet`.

## 1. Principles

| # | Principle | Rule |
| --- | --- | --- |
| P1 | Snapshot, not live | Market reads serve the latest cron snapshot with `meta.blockNumber` and `meta.asOf`. Request-time RPC exists only behind explicit `live=true` on wallet endpoints (§5.8), bounded and in its own rate-limit class. |
| P2 | No Neon on the request path | The API reads D1, plus Supabase for keys and profiles. Only the indexer tick touches Neon, so Neon CU-h no longer depends on traffic. |
| P3 | Exact amounts | Token amounts, weights, supplies, block numbers and token ids are base-unit decimal strings (`decimalStringSchema`), never JSON numbers. |
| P4 | USD with provenance | USD is a decimal string (`fixedDecimalSchema`) next to the price it used and that price's `source` (`priceSourceSchema`). Unpriced = `null`, never `0`, and the left-out count is returned (`unpricedRewards`). |
| P5 | One platform | Same keys (test/live, publishable/secret), scopes, `RateLimiter` DO, quota overrides, `mbx_api_requests` log, error body, CORS and cache rules as gauge profiles. One kill switch per data family. |
| P6 | Versioned, additive | `/v1` only grows: new routes, fields, query params and enum values. Enums are open: clients must accept unknown values (SDK docs say so). Removing or retyping a field means `/v2`. |
| P7 | Reproducible numbers | Every UI number is an API field or a §6 formula over API fields. A UI that needs a number the API lacks gets a field, not a side channel. |
| P8 | Explicit network | `network` is required (`mezo`, `mezo-testnet`); detail routes take it as a path segment (`/{network}/{address}`). No chain ids, no default network. |
| P9 | Reads only | The API never builds, simulates or sends transactions. Writes stay in the wallet (viem/wagmi) and in the existing Supabase edge functions. |
| P10 | Freshness is data | Warehouse-backed responses carry `meta.freshness`. A stale mirror degrades a response (`state: "stale"`); it never 503s the API. |

## 2. Starting point

### 2.1 Phase 1 (this release, in progress)

Contract: `packages/platform-contracts/src/market.ts`.

| Route | Params | Source | Freshness |
| --- | --- | --- | --- |
| `GET /v1/epochs/current` | — | computed (`epochSeconds` 604,800; vote window ± 1 h) | exact |
| `GET /v1/gauges` | `network`, `voter`, `alive`, `gauge` (≤ 50) | D1 latest snapshot | ≤ ~5 min |
| `GET /v1/gauges/{network}/{gaugeAddress}` | — | D1 latest snapshot | ≤ ~5 min |
| `GET /v1/gauges/{network}/{gaugeAddress}/epochs` | `limit` (12, ≤ 104) | D1 per-epoch history, last snapshot in the epoch wins | closed epochs immutable |
| `GET /v1/incentives` | `network`, `epoch` (`current`, `next`, start), `voter`, `gauge` | D1 snapshot (current, next) or history (closed) | ≤ ~5 min |
| `GET /v1/vebtc/{network}/{tokenId}/gauge` | — | D1 latest snapshot | ≤ ~5 min |
| Existing: `/v1/health`, `/openapi.json`, `/v1/networks`, `/v1/gauge-profiles` (+ detail, `/v1/vebtc/.../gauge-profile`) | | Supabase | profiles: live; chain state ≤ 10 min |

- Four voters: `boost`, `third-party` (veMEZO), `pools`, `validators`
  (veBTC). Gauge union discriminated on `voter`.
- Rewards per token: `kind` (`bribe`, `fees`), `amount`
  (`tokenRewardsPerEpoch`), `usd`; per gauge `totalUsd`, `unpricedRewards`,
  `aprPercent` (F1).
- Prices: registry only. Stablecoins $1, BTC-pegged at the Skip oracle BTC
  price on Mezo, MEZO at the Aerodrome Slipstream MEZO/MUSD pool on Base,
  anything else `usd: null`.
- `meta`: `source: "matchbox-market"`, network, epoch, `blockNumber`,
  `asOf`, `totalWeights` per voter, `prices.btcUsd` / `prices.mezoUsd` with
  source.
- Snapshot cron ~5 min into D1. History accumulates from launch; nothing
  before it (backfill is Phase 3).

### 2.2 What the UIs read today

| Consumer | Reads | Neon |
| --- | --- | --- |
| Classic (`apps/webapp`, `matchbox.markets`) | Browser and Next-route RPC; `api.mezo.org` proxies (pools, votables, accounts); GeckoTerminal, DexScreener, Curve; Base RPC (MEZO price); Supabase `gauge_history` and profiles; warehouse via `MATCHBOX_WAREHOUSE_URL` (5-min cache) | yes |
| Pro (`apps/matchbox-pro`, `feat/pro-rebuild`) | Worker RPC (topology, vote markets, earnings checkpoints, archive reads); `HISTORY_KV` close prices; `api.mezo.org` pool prices; warehouse via `MATCHBOX_WAREHOUSE_URL` once deployed; browser RPC (locks, votes, `earned`) | pending |
| MCP (`packages/matchbox-mcp`) | Scrapes `app.matchbox.markets`, overlays RPC | no |

No UI reads `votes`, `bribe_to_pool`, `reward_deposits` or `trove_updates`
yet; this roadmap is their first consumer.

## 3. Reconciliation with the indexed-data design (doc 11)

| Doc 11 assumed | Now | Why |
| --- | --- | --- |
| Goldsky dataset (Turbo/Mirror) ingest, reorg machinery, depth 32 | `matchbox-indexer` cron Worker: RPC `eth_getLogs` every 15 min into Neon, 2 blocks behind head | Goldsky exit (`docs/goldsky-exit.md`). Mezo is CometBFT; nothing to reorg at that depth |
| Separate `matchbox-api` Worker; Hyperdrive RO on every GET; `matchbox_pro` schema written by an API cron over `HYPERDRIVE_RW` | `developer-api` serves all `/v1`; reads D1 only; API cron writes D1; nothing writes Neon but the indexer | Neon Free: every cache miss can wake the compute for 5 min. Hyperdrive per request is out |
| Anonymous per-IP limits; site proxy with a service token | One key system; Pro and Classic are apps with secret keys and quota overrides | One auth, one limiter, one usage log (P5) |
| Profiles and monikers not in the API; site BFF joins Supabase | Profiles already served; validator `moniker` in Phase 1; `include=profile` joins in the API (§5.6) | The API is the BFF for third parties too |
| Paginated `/v1/gauges` (753+) | Whole filtered list from one snapshot (~800 gauges) | Fits one response; revisit above ~2,000 gauges or 1 MB |
| `/v1/gauges/:address/history` resampled series (`span`, `points`) | `/v1/gauges/{network}/{address}/epochs` per epoch | UIs chart per epoch. Intra-epoch series deferred until a UI needs one |
| `dataStatus` (`tentative`/`canonical`/`degraded`), `asOfBlock`, `generatedAt` | `{ data, meta }`; `meta.blockNumber`, `meta.asOf`; `meta.freshness` on mirror routes | Matches the shipped gauge-profile envelope |
| Error `{ error: code, message, requestId }` | `{ error: { code, message, requestId, docsUrl, issues? } }` | `ARCHITECTURE.md` §5 |
| Earnings ledger in `matchbox_pro` (PR 12a–c) | A6 sealed earnings in `matchbox` (indexer), mirrored to D1; ledger assembled in the API | One writer per store; the indexer already owns the math inputs |
| Indexer `price_observations` in Neon | API cron writes prices and epoch-close prices to D1 | Prices are current state plus sealed points; no Neon needed |
| `/v1/opportunities` returns ids; optimizer stays in a package | `/v1/opportunities` plus `POST /v1/optimize` running the shared optimizer over the snapshot | Third parties get Pro's ballot math without reimplementing it |
| `voting-context`, `actions` | Split into `locks`, `votes`, `claimable`; `live=true` overlay | Smaller, cacheable resources; `actions` is client logic over them |
| Testnet pipeline (PR 15) | Indexer is mainnet-only (`NETWORK = "mezo"`) | Open question 6 |

Kept from doc 11: decimal strings, USD provenance, the earnings math (F7),
claim `tokenId` recovery from calldata (A3), keyset cursors over
`(timestamp, block_number, log_index, id)`, explorer-compatible ids
(`{txHash}-{logIndex}-{ACTION}`), failure isolation (an indexer outage never
blocks voting or claiming), and "writes stay client-side".

## 4. Parity matrix

Sources: **snap** = RPC snapshot by the API cron into D1; **mirror** =
warehouse copied into D1 by the indexer; **ext** = external HTTP fetched by
the API cron into D1; **supa** = Supabase; **calc** = computed in the API
from other API data; **live** = bounded RPC at request time, opt-in.

Freshness: snap ≤ 5 min; mirror ≤ ~17 min (15-min tick plus sync); ext ≤ 15
min; closed epochs never change.

### 4.1 Market data

| # | Entity | UI | Endpoint | Source | Phase |
| --- | --- | --- | --- | --- | --- |
| M1 | Epoch timing, vote window | both | `/v1/epochs/current` | calc | 1 |
| M2 | Gauges per voter: address, alive, weight, bribe | both | `/v1/gauges` | snap | 1 |
| M3 | Boost gauge: veBTC token, beneficiary, multiplier | Classic /gauges, /boost; Pro /vote | `/v1/gauges` | snap | 1 |
| M4 | Rewards per gauge per epoch (bribes, fees), USD, APR | both | `/v1/incentives` | snap | 1 |
| M5 | Voter total weights | both | `meta.totalWeights` | snap | 1 |
| M6 | BTC/USD, MEZO/USD | both | `meta.prices`; `/v1/prices` | snap | 1 / 3 |
| M7 | veBTC lock → gauge | Classic /incentives | `/v1/vebtc/{n}/{id}/gauge` | snap | 1 |
| M8 | Gauge profiles | both | `/v1/gauge-profiles` | supa | done |
| M9 | Boost subscription: unboosted veBTC power, optimal veMEZO, ratio, status, APR at optimal | Classic gauge detail | `/v1/gauges`, `/v1/incentives` (added fields) | snap + calc (F5) | 3 |
| M10 | ve supplies, total voting power, participation | Classic /mezo-gauges; `gauge_history` | `/v1/stats` | snap | 3 |
| M11 | Prices for non-registry tokens | Classic (GeckoTerminal), Pro (`api.mezo.org` `priceUsd`) | `/v1/prices?include=market` | ext | 3 |
| M12 | Epoch-close prices | Pro /rewards, /gauges | `/v1/prices/epochs` | snap (archive reads at epoch end) | 3 |
| M13 | Token registry: symbol, decimals, price type, whitelisted per voter | Classic /incentives; both | `/v1/tokens` | snap + registry | 3 |
| M14 | Validators: operator, consensus key, moniker, identity, website, details, gauge, beneficiary, weight, alive (incl. validators without a gauge) | Classic /incentives, /validator-gauges; Pro /vote | `/v1/validators` | snap | 3 |
| M15 | PoolsVoter targets: pool or vault, pair tokens, name, symbol, fees and bribes | Pro /vote; Classic /pools, /voteables | `/v1/pools` | snap | 3 |
| M16 | Pool metrics: TVL, reserves, volume, fees, fee APR, emissions APR, voting APR, MATS boost, concentrated state | Classic /pools | `/v1/pools` `metrics` | ext (`api.mezo.org`) | 3 |
| M17 | Third-party gauge registry: name, protocol, listed, remote venue | Classic /boost, /mezo-gauges | `/v1/gauge-profiles?profileType=third-party-gauge`; `include=profile` | supa | 3 |
| M18 | Remote venue liquidity and volume (Base, Ethereum) | Classic /boost, /mezo-gauges | `/v1/venues` | ext | 3 (decide) |
| M19 | Merkl campaigns and claims | Classic /mezo-gauges | `/v1/merkl` | ext + RPC logs | 3 (decide) |
| M20 | Mezo account lookup | Classic /id-lookup | `/v1/accounts/{network}/{id}` | ext pass-through | 3 (decide) |

### 4.2 History and activity

| # | Entity | UI | Endpoint | Source | Phase |
| --- | --- | --- | --- | --- | --- |
| H1 | Gauge per epoch: weight, boost, rewards, USD, APR, voters | Classic gauge detail (`gauge_history`); Pro /gauges/$address | `/v1/gauges/{n}/{a}/epochs` | snap (forward) + backfill | 1 / 3 |
| H2 | Incentive deposits per epoch (protocol, per voter, per gauge) | Pro Overview | `/v1/incentives/epochs` | mirror `reward_deposits` + M12 | 2 |
| H3 | Protocol activity feed | Classic /activity; Pro /activity | `/v1/activity` | mirror `activity_events` | 2 |
| H4 | Transaction detail | Pro /activity/tx | `/v1/activity/tx/{n}/{hash}` | mirror | 2 |
| H5 | Votes per gauge; weight by wallet (`byWallet`, `topWallet`, voting NFTs, wallets) | Classic /mezo-gauges; gauge detail unique voters | `/v1/votes`, `/v1/votes/by-wallet` | mirror `votes` + `lock_positions` | 2 |
| H6 | Emissions distributed by vote epoch | Classic /mezo-gauges | `/v1/emissions` | mirror | 2 |
| H7 | Lock cohort counts per epoch | Classic /mezo-gauges | `/v1/stats/locks` | mirror `lock_positions` | 2 |
| H8 | Protocol stats per closed epoch | Classic /mezo-gauges history | `/v1/stats/epochs` | snap (forward) | 3 |
| H9 | Freshness and coverage | Classic "as of" chip; Pro `/api/history/status` | `/v1/status`; `meta.freshness` | mirror + snap | 2 |

### 4.3 Wallet data

| # | Entity | UI | Endpoint | Source | Phase |
| --- | --- | --- | --- | --- | --- |
| W1 | Locks: escrow, amount, unlock, permanent, voting power, boost, merged, withdrawn | Classic /boost, /dashboard; Pro Overview, /vote | `/v1/wallets/{n}/{a}/locks` | mirror (+ live) | 4 |
| W2 | Votes per lock, used weight, last voted | both | `/v1/wallets/{n}/{a}/votes` | mirror (+ live) | 4 |
| W3 | Projected rewards this epoch | Classic /dashboard; Pro Overview | `/v1/wallets/{n}/{a}/votes?include=projected` | calc (F4) | 4 |
| W4 | Claimable per lock, reward contract, token | both | `/v1/wallets/{n}/{a}/claimable` | live (4), mirror A6 (5) | 4 / 5 |
| W5 | veBTC owner's boost gauges | Classic /incentives | `/v1/wallets/{n}/{a}/gauges` | snap | 4 |
| W6 | mUSD troves: current state and history | Pro Stuart tools | `/v1/wallets/{n}/{a}/troves` | mirror `trove_updates` + calc | 4 |
| W7 | Wallet activity | Classic /transactions; Pro | `/v1/wallets/{n}/{a}/activity` | mirror | 2 |
| W8 | Earnings per sealed epoch, totals (realized, claimed, claimable, projected) | Pro Overview, /rewards | `/v1/wallets/{n}/{a}/earnings` | mirror A6 + M12 | 5 |
| W9 | Ledger and CSV | Pro /rewards | `/v1/wallets/{n}/{a}/ledger`, `.csv` | mirror A6 + claims + M12 | 5 |
| W10 | Suggested ballot, marginal APR | Pro /vote; Classic /boost | `POST /v1/optimize`, `/v1/opportunities` | calc over snap | 6 |

### 4.4 Out of scope

| Item | Where it stays |
| --- | --- |
| Vote, reset, poke, claim, lock create/extend/merge, incentive deposits | Wallet, client-side (P9) |
| Transaction building, simulation, zap quotes | Client-side; Stuart tools later |
| Profile edits, ownership checks, Discord links | Supabase edge functions, Matchbox ID |
| Stuart conversations, proposals, support reports | Pro Worker; becomes an API consumer (Phase 7) |
| Wormhole bridge history | Pro Stuart tool over the bridge's own API; revisit if a page needs it |
| Academy | Retired (routes answer 410) |
| Blocks, search, raw logs, holders | Matchscan, later product |

## 5. Endpoints for later phases

### 5.1 Conventions

- Envelope `{ data, meta }`; lists add `nextCursor` (opaque, keyset, the
  shared cursor codec) when paginated. `limit` defaults to 50, max 100 unless
  stated.
- `meta.source`: `matchbox-market` (snapshot), `matchbox-warehouse`
  (mirror), `matchbox-profiles` (Supabase), `mezo-api` and other external
  tags for ext data.
- `meta.freshness` on mirror routes:
  `{ indexedThroughBlock, indexedAt, syncedAt, lagSeconds, state }`,
  `state` ∈ `fresh`, `stale` (> 45 min, Pro's existing threshold),
  `unavailable` (no mirror for this network). Mirror routes on a network
  without a mirror answer `200` with empty `data` and `state:
  "unavailable"`, not `404`.
- Addresses lower-case on output; any case on input.
- `include=` adds embedded objects (`profile`, `incentives`, `projected`);
  never changes existing fields.
- Repeatable filters accept `?x=a&x=b` or `?x=a,b` (as `gauge` in Phase 1).

### 5.2 Prices and tokens (Phase 3)

| Route | Params | Data |
| --- | --- | --- |
| `GET /v1/prices` | `network`, `token` (≤ 50), `include=market` | `[{ token, symbol, decimals, priceType, usd, source, asOf }]`; `meta.reference: { btcUsd, mezoUsd }` |
| `GET /v1/prices/epochs` | `network`, `limit` (8, ≤ 104), `before` (epoch start) | `[{ epochStart, epochEnd, btcUsd: { usd, source, blockNumber } \| null, mezoUsd: { usd, source, chain: "base", blockNumber } \| null, settled }]` |
| `GET /v1/tokens` | `network`, `token` (≤ 50), `whitelistedBy` (voter) | `[{ token, symbol, name, decimals, priceType, whitelistedBy: VoterKind[] }]` |

- `priceType`: `stablecoin`, `btc-pegged`, `mezo`, `unknown` (the
  `packages/shared/src/pricing` registry).
- `include=market` adds non-registry tokens priced by `api.mezo.org`
  `/pools` `priceUsd` (`source: "mezo-api"`). Market prices never feed
  `totalUsd` or `aprPercent` unless the owner decides otherwise (question 1).
- Close price = the last block with `timestamp < epochEnd` on each chain.
  `settled: false` means a read failed and will be retried; such rows are
  not cached long.
- Whitelist: RPC `isWhitelistedToken` per voter over the registry plus every
  reward token seen in a snapshot.

### 5.3 Protocol stats (Phases 2–3)

| Route | Params | Data |
| --- | --- | --- |
| `GET /v1/stats` | `network` | `{ escrows: { veMEZO: { supply, totalVotingPower }, veBTC: {...} }, voters: { [voter]: { totalWeight, gauges, aliveGauges, participationBps } }, incentives: { epochStart, totalUsd, unpricedRewards } }` |
| `GET /v1/stats/epochs` | `network`, `limit` | the same object per closed epoch (forward from Phase 3) |
| `GET /v1/stats/locks` | `network`, `escrow`, `from`, `to` | `[{ epochStart, created, withdrawn, merged }]` (mirror) |

### 5.4 Validators (Phase 3)

| Route | Params | Data |
| --- | --- | --- |
| `GET /v1/validators` | `network`, `hasGauge`, `include=incentives,profile` | `[{ network, operatorAddress, consensusPublicKey, moniker, identity, website, securityContact, details, gaugeAddress \| null, bribeContract \| null, beneficiary \| null, isAlive \| null, weight }]` |
| `GET /v1/validators/{network}/{operatorAddress}` | same `include` | one row |

Replaces Classic's sequential N+1 BFF and Pro's `/api/vote/validators`.
`include=incentives` embeds the row from `/v1/incentives?voter=validators`
so a ballot is one request.

### 5.5 Pools (Phase 3)

| Route | Params | Data |
| --- | --- | --- |
| `GET /v1/pools` | `network`, `kind` (`pool`, `vault`), `votable`, `include=incentives` | see below |
| `GET /v1/pools/{network}/{targetAddress}` | same | one row |

```text
{ network, targetAddress, kind: "pool" | "vault", name, symbol,
  tokens: [{ address, symbol, decimals }], gaugeAddress | null,
  feesContract | null, bribeContract | null, isAlive | null, weight,
  metrics: null | { source: "mezo-api", fetchedAt, poolType: "basic" |
    "concentrated", volatility, tvlUsd, reserves: [{ token, amount, usd }],
    volume: [{ token, amount, usd }], fees: [{ token, amount, usd }],
    feeAprPercent, emissionsAprPercent, votingAprPercent, matsBoost,
    concentrated: null | { tick, sqrtPriceX96, liquidity, stakedLiquidity,
      tickSpacing } } }
```

- Topology (`target`, gauge, contracts, weight) is snap; `metrics` is ext
  and may be `null` with `meta.metricsStatus: "unavailable"`.
- `incentiveAprPercent` (LP view, F6) is added to `metrics` when TVL and
  incentives are both priced.

### 5.6 Gauge and vote extensions

| Change | Phase | Notes |
| --- | --- | --- |
| Boost gauge fields `vebtcVotingPower`, `optimalVemezoWeight`, `subscriptionRatio`, `subscriptionStatus` (`under`, `perfect`, `over`, `unknown`) | 3 | F5; inputs `unboostedVotingPowerOfNFT` and escrow `supply()` |
| Incentive row field `aprAtOptimalPercent` (boost) | 3 | F1 at `optimalVemezoWeight` |
| `include=profile` on `/v1/gauges`, `/v1/validators` | 3 | embeds the gauge-profile summary (`displayName`, `avatarUrl`, `tags`); no N+1 |
| Profile type `third-party-gauge` (name, protocol, listed, venue `{ chain, address, kind }`) | 3 | Supabase; seeded from Classic's `MEZO_GAUGES` registry |
| `GET /v1/votes` | 2 | `network`, `voter`, `gauge`, `owner`, `tokenId`, `active`, cursor → `[{ voter, tokenId, gaugeAddress, owner, weight, lastUpdatedEpoch, lastUpdatedAt, isActive }]`; `owner` is the current lock owner from `lock_positions` |
| `GET /v1/votes/by-wallet` | 2 | `network`, `voter`, `gauge` → `[{ owner, weight, shareBps, gauges[] }]`, `meta: { totalWeight, votingNfts, wallets }` |
| `GET /v1/emissions` | 2 | `network`, `voter`, `from`, `to` → `[{ voteEpochStart, total, gauges: [{ gaugeAddress, amount }] }]`; a distribution at the epoch flip pays the previous vote epoch |
| Backfill of `/v1/gauges/{n}/{a}/epochs` before Phase 1 launch | 3 | rows carry `source: "backfill"`; see §7.6 |

### 5.7 Activity and incentive history (Phase 2)

| Route | Params | Data |
| --- | --- | --- |
| `GET /v1/activity` | `network`, `actor`, `recipient`, `tokenId`, `gauge`, `pool`, `txHash`, `actionType` (repeatable), `source`, `from`, `to` (unix s), `compat=explorer`, `limit`, `cursor` | explorer `ActivityEvent` fields in camelCase plus `kind`, `escrow`, `symbol`, `decimals`, `explorerParity` |
| `GET /v1/activity/tx/{network}/{txHash}` | — | `{ index: "indexed" \| "not_indexed" \| "pending_index", items }`; `pending_index` when the block is past `indexedThroughBlock` |
| `GET /v1/incentives/epochs` | `network`, `voter`, `gauge`, `limit` (8, ≤ 104), `before` | `[{ epochStart, status, deposits, gauges, tokens: [{ token, symbol, decimals, amount, usdAtClose, priceSource }], totalUsdAtClose, unpriced }]` |
| `GET /v1/status` | `network` | `{ snapshot: { blockNumber, asOf, ageSeconds }, warehouse: { indexedThroughBlock, indexedAt, syncedAt, lagSeconds, decoderVersion, state }, coverage: { historyFrom, activityFromBlock, earnings }, external: { [source]: { fetchedAt, state } } }` |

- Order: `(timestamp, block_number, log_index, id)` descending, the
  warehouse's chain order. Cursor = the last row's key.
- `compat=explorer` returns only `explorer_parity` rows with the decoder-v2
  enrichments (`INCENTIVE_ADDED.epochStart`, `VOTE_*_CLAIMED.tokenId`) as
  `null`: Classic's current semantics (`docs/goldsky-exit.md`). Pro reads
  every row.
- `kind` is Pro's `ACTIVITY_KINDS` grouping. UI-only collapsing (for
  example hiding a `BOOST_ABSTAIN` paired with a `BOOST_VOTE` in one poke)
  stays client-side and is documented as a recipe.
- `incentives/epochs` sums `reward_deposits.amount` by
  `(epoch_start, token)`: exactly `tokenRewardsPerEpoch`, which
  `INCENTIVE_ADDED` is not (one BoostVoter deposit bypassed `BribesAdded`).

### 5.8 Wallet endpoints (Phases 2, 4, 5)

All under `/v1/wallets/{network}/{address}/`.

| Route | Params | Data | Phase |
| --- | --- | --- | --- |
| `locks` | `escrow`, `include=withdrawn`, `live` | `[{ escrow, tokenId, amount, unlockAt \| null, isPermanent, votingPower, boost \| null, createdAt, isWithdrawn, isMerged, mergedIntoTokenId \| null, boostGauge \| null }]` | 4 |
| `votes` | `voter`, `include=projected`, `live` | `[{ voter, tokenId, usedWeight, lastVotedAt, votes: [{ gaugeAddress, weight }], projected?: [{ token, amount, usd }] }]` | 4 |
| `claimable` | `voter`, `tokenId`, `live` | `[{ tokenId \| null, voter, gaugeAddress, rewardContract, kind, token, symbol, decimals, amount, usd, priceSource }]`, `meta.totals` | 4 (live), 5 (sealed) |
| `gauges` | — | boost gauges whose veBTC lock this wallet owns, `include=profile` | 4 |
| `troves` | `include=history` | `{ current: { principal, interest, coll, status, collateralRatioBps \| null, liquidationPriceUsd \| null }, history: [{ action, principal, interest, coll, debtChange, txHash, timestamp }] }` | 4 |
| `activity` | as `/v1/activity` minus `actor` | rows where the wallet is actor, recipient or tx sender, or the row's `tokenId` belongs to it | 2 |
| `earnings` | `tokenId`, `epochs` (≤ 52) | `{ tokenIds, current (projected), epochs: [{ epochStart, status: "sealed", tokens, usdAtClose, unpriced }], totals: { realized, claimed, claimable, projected }, method }` | 5 |
| `ledger` | `from`, `to`, `status` (`pending`, `claimable`, `claimed`), `gauge`, `tokenId`, cursor | `[{ id, epochStart, escrow, voter, tokenId, gaugeAddress, rewardContract, rewardType, token, symbol, decimals, amount, usdAtClose, status, claim: { txHash, blockNumber, confidence: "exact" \| "wallet" } \| null, method }]` | 5 |
| `ledger.csv` | same as `ledger` | CSV, includes `tokenId` and `confidence` | 5 |

- `earnings` and `ledger` keep Pro's wire shapes (`WireEarnings`,
  `WireLedgerRow`) with API naming, so Pro maps them one to one. Projected
  rows never enter lifetime totals.
- Default reads come from D1 (mirror, ≤ ~17 min). `live=true` reads chain
  state for this wallet only: one Multicall3 pinned to one block, over the
  token set known from the mirror (locks owned, gauges ever voted, reward
  tokens of those gauges' contracts). No cartesian scan of all gauges.
  `Cache-Control: no-store`; memoized per wallet for 15 s.
- `claimable` in Phase 4 is live-only (`earned(token, tokenId)` per triple
  above) because the warehouse has no sealed earnings yet. Phase 5 serves
  it from A6 (F7) by default and keeps `live=true` as the exact head value.
  This is the one place a default read touches RPC; see question 9.
- `votingPower`: computed from lock state where a golden test proves it
  equals `balanceOfNFT` at a fixture block; otherwise snapshotted. Phase 4
  decides per escrow.
- Collateral ratio (F9) uses the snapshot BTC price; accrued interest uses
  the musd `InterestRateMath` already in the indexer.

### 5.9 Optimizer and opportunities (Phase 6)

```text
POST /v1/optimize
{ network, voter, epoch: "current" | "next",
  tokenIds?: string[] | votingPower?: string[],
  exclude?: address[], only?: address[], maxGauges?: int }
→ { data: { allocations: [{ gaugeAddress, basisPoints, voteWeight,
      projectedRewardUsd, projectedAprPercent }],
    projectedRewardUsd, evaluatedGaugeCount },
    meta: <snapshot meta> }

GET /v1/opportunities?network&voter&epoch&votingPower=<base units>
→ incentive rows + marginalAprPercent (F3) and projectedRewardUsd (F4)
  for that added weight, sorted descending
```

- Pure function over the snapshot: `optimizeRewardAllocations` from the
  shared rewards optimizer (on the Pro branch in `packages/shared`; moves to
  `@repo/shared` on `main` first). Pro and the API then return identical
  ballots.
- Competing weight = gauge weight minus the caller's own current votes on
  that gauge (known when `tokenIds` is given). Unpriced rewards are left out
  and counted.
- `POST` because the body can carry many locks; no writes. CORS preflight
  already handled.

### 5.10 Auth, scopes, rate-limit classes

Wallet data is public chain data: plain API keys suffice. No Matchbox ID
token, no wallet signature.

| Class | Routes | Test /min, /day | Live /min, /day | Notes |
| --- | --- | --- | --- | --- |
| `market` | snapshot, history, activity, prices, tokens, stats, status | 60 / 5,000 | 300 / 100,000 | today's `gauge-profiles` policy |
| `wallet` | wallet routes from D1 | 60 / 5,000 | 300 / 100,000 | counts 2 units in the environment bucket |
| `wallet-live` | `live=true`; Phase 4 `claimable` | 10 / 500 | 60 / 10,000 | own bucket; plus `wallet:{network}:{address}` 30/min across all keys |
| `compute` | `POST /v1/optimize`, `/v1/opportunities` | 10 / 1,000 | 60 / 20,000 | own bucket |
| `export` | `*.csv` | 2 / 50 | 6 / 1,000 | own bucket |

- Numbers are proposals; `mbx_dev_quota_overrides` applies per class. Pro
  and Classic get large overrides because all their users share one key;
  per-user fairness stays in their Workers.
- One environment bucket with per-route costs keeps the console's quota
  view simple; RPC-backed and CPU-heavy classes get separate buckets so
  they cannot starve market reads.
- Scopes: live keys need an approved scope. Today only
  `gauge-profiles:read` exists. Proposed: `market:read` and `wallets:read`,
  both auto-approved like `gauge-profiles:read`, separate so staff can
  restrict one (question 5).
- Privacy:
  - The API never joins off-chain identity (Matchbox ID accounts, Discord,
    emails, profile editors) to a wallet.
  - Request logs keep the route template (`/v1/wallets/{network}/{address}/locks`),
    never the address; Worker logs must not print addresses either.
  - Publishable keys may call wallet routes (browser dashboards), bound to
    registered origins.
  - Optional anti-scrape control: distinct wallets per key per day (off by
    default; question 8).

### 5.11 SDK

Each phase regenerates `openapi.json` and the SDK: `market.gauges`,
`market.incentives`, `prices`, `tokens`, `stats`, `validators`, `pools`,
`votes`, `activity`, `wallets.*`, `optimize`. Iterators for cursor routes.

## 6. Formulas

Every formula ships in `@repo/platform-contracts` docs and has a golden test
against the UI code it replaces.

| # | Number | Formula | Replaces |
| --- | --- | --- | --- |
| F1 | Gauge APR | `totalUsd × 52 / (weight / 1e18 × votingTokenUsd) × 100`; MEZO for `boost`, `third-party`; BTC for `pools`, `validators`; `null` with no priced rewards, zero weight or no price | Classic `useAPY.ts`, validator APY; Phase 1 `aprPercent` |
| F2 | Reward USD | `amount / 10^decimals × priceUsd(token)`; registry price types; else `null` | `packages/shared/src/pricing` |
| F3 | APR after adding `x` | F1 with `weight + x` | Classic `calculateProjectedAPY`; Pro marginal vote APY |
| F4 | Projected reward | per token `amount × voteWeight / gaugeWeight`; USD the same | Classic `calculateProjectedRewards`; Pro `usePersonalProjected` |
| F5 | Boost subscription | `optimal = vebtcVotingPower × veMEZO.supply / veBTC.supply`; `ratio = weight / optimal`; `perfect` within ± 200 bps, else `under` / `over`; `aprAtOptimal` = F1 at `optimal`; dilution `1 − 1/ratio` when `ratio > 1` | `record-gauge-history` |
| F6 | Pool incentive APR (LP view) | `weeklyIncentivesUsd × 52 / tvlUsd × 100` | Classic `usePoolsIncentivesApr` |
| F7 | Earned per sealed epoch | `floor(deposited × nftVotes / gaugeVotes)` per (tokenId, gauge, reward contract, token, epoch); `deposited = Σ reward_deposits.amount`; `gaugeVotes` from the reward contract's supply at the epoch, never `Voted.totalWeight`; claimable = Σ sealed earned − claimed | Pro `rpc-checkpoints-v1`; doc 11 earnings math; goldsky-exit A6 |
| F8 | Participation | `totalWeight × 10,000 / escrow.totalVotingPower` (bps); share of a wallet = `weight × 10,000 / totalWeight` | Classic `participation.ts` |
| F9 | Trove collateral ratio, liquidation price | `ICR = coll × btcUsd / (principal + interest)` (1e18 fixed point, floor; liquidatable iff `ICR < MCR`); liquidation price `= ⌈MCR × debt / coll⌉` | Pro Stuart `loanMath` (LiquityMath) |
| F10 | Optimizer | shared `optimizeRewardAllocations` (integer sqrt allocation over competing weight) | Pro ballot optimizer |

Rules: integer math in base units (BigInt), floor division where the
contracts floor; USD derived last and rounded only for display by clients.

## 7. Serving architecture

```text
Mezo RPC, Base RPC ──> developer-api cron */5 ──────────┐
api.mezo.org, venues ─> developer-api cron */15 ────────┤
archive RPC ─────────> developer-api cron hourly ───────┤──> D1 MARKET_DB
                                                        │
Mezo RPC ─> matchbox-indexer */15 ─> Neon warehouse     │
                 └── same tick, Neon awake ─────────────┼──> D1 MIRROR_DB
                                                        │
3rd parties, Pro Worker, Classic Worker, MCP, Stuart    │
   ──> api.matchbox.markets /v1 ──> D1 (both), Supabase (keys, profiles)
                                    RPC only for live=true
```

### 7.1 D1 databases

Two databases: each D1 database is single-threaded, so the indexer's bulk
writes never queue behind snapshot writes or reads, and either can be
rebuilt alone. Both have read replication on (Sessions API) for global read
latency. One writer per database:

| Database | Writer | Readers |
| --- | --- | --- |
| `MARKET_DB` (Phase 1) | developer-api cron | developer-api requests |
| `MIRROR_DB` (Phase 2) | matchbox-indexer tick | developer-api requests (read-only by convention: the store type exposes no writes) |

Amounts are `TEXT` decimal strings: SQLite integers are 64-bit, so sums of
base units happen in the Worker with BigInt, never in SQL.

### 7.2 Schema sketch

`MARKET_DB` (Phase 1 names are authoritative where they differ):

| Table | Key | Columns | Notes |
| --- | --- | --- | --- |
| `market_snapshots` | `(network, snapshot_id)` | `block_number`, `as_of`, `epoch_start`, `payload_json`, `payload_hash` | one row per network per run; keep 24 h |
| `market_latest` | `network` | `snapshot_id` | pointer flipped last, so readers never see half a snapshot |
| `gauge_epochs` | `(network, gauge_address, epoch_start)` | `voter`, `payload_json`, `block_number`, `as_of`, `source` (`snapshot`, `backfill`) | index `(network, epoch_start, voter)` |
| `epoch_stats` | `(network, epoch_start)` | `payload_json`, `block_number`, `as_of` | H8 |
| `epoch_close_prices` | `epoch_start` | `btc_usd`, `btc_block`, `mezo_usd`, `mezo_base_block`, `sources`, `settled` | M12 |
| `tokens` | `(network, token)` | `symbol`, `name`, `decimals`, `price_type`, `whitelisted_by` | M13 |
| `ext_fetches` | `(network, source, key)` | `fetched_at`, `status`, `payload_json` | pool metrics, market prices, venues, Merkl, accounts |

`MIRROR_DB`:

| Table | Key | Hot columns (indexed) | Rest |
| --- | --- | --- | --- |
| `wh_activity_events` | `(network, id)` | `timestamp`, `block_number`, `log_index`, `action_type`, `source`, `actor`, `recipient`, `tx_from`, `tx_hash`, `token_id`, `gauge`, `pool`, `explorer_parity` | `payload_json` (all other explorer fields) |
| `wh_lock_positions` | `(network, escrow, token_id)` | `owner`, `updated_block` | amount, unlock, flags, boost, merge fields |
| `wh_votes` | `(network, voter_contract, token_id, gauge)` | `gauge`+`is_active`, `owner`, `updated_block` | weight, epoch, timestamps |
| `wh_reward_deposits` | `(network, tx_hash, log_index)` | `(epoch_start, gauge)`, `(gauge, epoch_start)` | contract, token, amount, voter source, depositor |
| `wh_trove_updates` | `(network, tx_hash, log_index)` | `(borrower, block_number)` | state, interest, `debt_change`, action |
| `wh_contracts` | `(network, address)` | `kind`, `gauge`, `pool` | reward-contract registry for `claimable` fan-out |
| `wh_epoch_earned`, `wh_epoch_vote_balances` | per A6 | `(token_id, epoch_start)` | Phase 5 |
| `sync_state` | `(network, stream)` | — | `through_block`, `through_key`, `decoder_version`, `synced_at`, `source_projected_block` |

Activity indexes: `(network, timestamp DESC, block_number DESC, log_index
DESC, id)`, and `(network, X, timestamp DESC)` for X in `actor`,
`recipient`, `tx_from`, `gauge`, `action_type`, `token_id`, plus
`(network, tx_hash)`. A compact row (13 hot columns + JSON) keeps bound
parameters low and storage close to the Neon projection.

### 7.3 Indexer → D1 sync

Runs at the end of the indexer's `scheduled()`, after projection and
`pruneRaw`, while the Neon compute is already awake (`src/mirror/sync.ts`).

1. Upper bound = the projection checkpoint (never the ingest checkpoint), so
   half-projected blocks are never copied.
2. Streams in order: `contracts`, `lock_positions`, `votes`,
   `reward_deposits`, `trove_updates`, `activity_events` (later
   `epoch_vote_balances`, `epoch_earned`).
3. Per stream, read the watermark `(through_block, through_key)` from
   `sync_state`, then page Neon by keyset on `(change_block, key)` up to the
   upper bound, 2,000 rows a page. `change_block` is `block_number` for
   append-only tables and `updated_block` for mutable ones.
4. Write each page with one `db.batch()`: multi-row
   `INSERT … ON CONFLICT (pk) DO UPDATE SET … = excluded.…`, then the
   `sync_state` update in the same batch. A batch is a transaction, so rows
   and watermark move together. Re-copying a range is harmless.
5. Loop until caught up or the tick's sync budget (20 s wall) is spent; the
   next tick continues.

Limits and sizing:

| D1 limit | Value | Design |
| --- | --- | --- |
| Bound parameters per statement | 100 | rows per statement = ⌊100 / columns⌋; ~6–7 activity rows |
| Statement length | 100 KB | `payload_json` ≈ 1 KB a row; well under |
| Batch duration | 30 s | ≤ 400 statements (~2,500 rows) per batch |
| Queries per invocation | 1,000 (Paid) | a batch counts as one |
| Row size | 2 MB | snapshot blobs ≤ ~1 MB; split by voter past that |
| Database size | 10 GB | mirror ≈ 0.3 GB |

- Steady state: 10–100 rows a tick, one batch, well under a second.
- Initial load: `scripts/mirror-load.ts` exports Neon to SQL files and runs
  `wrangler d1 execute MIRROR_DB --remote --file`, then seeds `sync_state`
  with the exported watermark. One Neon wake, run by hand.
- Mutable tables need a change column. Warehouse migration `0012` adds
  `updated_block bigint` to `lock_positions`, `votes` and `contracts`, set by
  the pg store on every write and initialized to the current projection
  checkpoint (one full copy of ~20k rows). Bookkeeping only, so no
  `DECODER_VERSION` bump.
- Replays: projections delete rows only on replay. When Neon
  `projection_state.decoder_version` differs from `sync_state`, the sync
  fills `wh_*_next` shadow tables over as many ticks as needed, then one
  batch drops the old tables and renames the new ones. Readers never see a
  half-built mirror.

### 7.4 Failure modes

| Failure | Effect | Recovery |
| --- | --- | --- |
| D1 unavailable or a batch fails | Neon tick still commits; log `MIRROR SYNC FAILED`; watermark unchanged | next tick resumes; catch-up bounded by the sync budget |
| Neon down, suspended for quota, or paused at the storage cap | no tick; mirror frozen; snapshots unaffected | `meta.freshness.state` → `stale` after 45 min; API keeps serving |
| Projection halted (replay required) | mirror frozen at the last projected block | replay, then shadow-table resync |
| Snapshot cron fails | `market_latest` keeps the previous snapshot; `meta.asOf` ages | next run; alert after 3 missed runs |
| Mezo RPC endpoint down | snapshot fails over in the indexer's RPC order | automatic |
| External source down | `metrics: null`, `meta.metricsStatus: "unavailable"` | next ext fetch |
| API Worker down | Pro and Classic adapters fall back to their old paths while flags exist (§8) | flip `*_DATA_SOURCE` |

### 7.5 Cron cadences

Workers Paid allows 250 cron triggers per account and 30 s of CPU per cron
run under an hourly interval; network waits do not count as CPU.

| Job | Worker | Cron | Reads | Writes |
| --- | --- | --- | --- | --- |
| Health probes (existing) | developer-api | `* * * * *` | own `/v1/health`, ID discovery, RPC head | Analytics Engine |
| Market snapshot (Phase 1) | developer-api | `*/5 * * * *` | Mezo RPC (Multicall3 at one block), Base RPC | `MARKET_DB` |
| Chain-state reconcile (existing) | developer-api | `*/10 * * * *` | Mezo RPC, Supabase | Supabase |
| External fetches | developer-api | `2,17,32,47 * * * *` | `api.mezo.org`, venues, Merkl | `MARKET_DB` `ext_fetches` |
| Epoch close and stats seal | developer-api | `7 * * * *` | archive RPC at the epoch-end block (Mezo, Base) | `epoch_close_prices`, `epoch_stats` |
| Snapshot pruning | developer-api | inside the hourly run | — | deletes snapshots > 24 h |
| Indexer tick + mirror sync | matchbox-indexer | `*/15 * * * *` | Mezo RPC, Neon | Neon, `MIRROR_DB` |
| A6 sealing (Phase 5) | matchbox-indexer | inside the tick once `epoch_end` is 2 blocks final | Neon | Neon → mirror |

`gauge_epochs` is upserted when a gauge's payload hash changes, at most
hourly, plus a final write after `voteEnd` and after `end`, so "last
snapshot in the epoch" holds without writing ~800 rows every 5 minutes.

### 7.6 History backfill (Phase 3)

| Range | Source | Precision |
| --- | --- | --- |
| Reward amounts per epoch, all voters | mirror `reward_deposits` | exact |
| Gauge weight at epoch end | reward contract supply checkpoints at the epoch (head-state RPC) | exact |
| Boost multiplier at epoch end | archive `getBoost` at the epoch-end block | exact where archive exists |
| Close prices | archive Skip oracle (Mezo), archive `slot0` (Base) | exact where archive exists |
| Boost gauges before the warehouse (from Dec 2024) | Supabase `gauge_history` | USD `NUMERIC(20,2)` from float math: imported with `source: "legacy-gauge-history"`, amounts preferred from `incentive_breakdown.amount_raw` |

Then `record-gauge-history` (Supabase cron) and Classic's reads of
`gauge_history` retire.

### 7.7 Caching and ETags

| Data | `Cache-Control` | ETag |
| --- | --- | --- |
| Snapshot routes | `private, max-age=min(60, seconds to next snapshot)` | hash(snapshot id, normalized query); `If-None-Match` answered from a 15 s in-isolate `market_latest` memo without reading the blob |
| Closed epochs, settled close prices | `private, max-age=86400, immutable` | hash(row keys) |
| Mirror routes | `private, max-age=60` | hash(`sync_state.synced_at`, query) |
| `live=true` | `no-store` | none |

- `private` because every response is behind a key (`ARCHITECTURE.md` §6);
  shared CDNs must not reuse them across keys.
- Inside the Worker, after auth, the Workers Cache API caches by normalized
  URL (not by key) for the same TTL: the data is identical for every key.
- Snapshot payloads are memoized per isolate by snapshot id, so a hot
  isolate parses each blob once.

### 7.8 Budgets

Neon (CU-h a month):

| Consumer | Today | After Phase 2 cutover | Warehouse on D1 (Phase 8) |
| --- | --- | --- | --- |
| Indexer ticks `*/15` (2,880 × ~5.1 min × 0.25 CU) | ≈ 62–67 | ≈ 62–68 (sync adds 1–3 s inside the awake window) | 0 |
| Classic warehouse reads (5-min cache) | 0–38; steady misses can push the month toward 180 | 0 | 0 |
| Pro warehouse reads | not deployed; would share the same 38 | 0 (never configured) | 0 |
| API requests | 0 | 0 | 0 |
| Manual checks, initial loads, replays | small, one-off | small, one-off | 0 |
| **Month** | **62–100+, traffic-dependent** | **≈ 63–68, traffic-independent** | **0** |

With reads gone, a `*/12` tick (≈ 77 CU-h) would cut the worst-case lag
from 15 to 12 minutes; `*/10` (≈ 92 CU-h) is too close to the cap.

D1 (a month, mainnet + testnet):

| Writer | Rows written |
| --- | --- |
| Snapshot runs (*/5, 2 networks, blob + pointer) | ~35 k |
| `gauge_epochs`, change-gated (§7.5) | ~0.5–2 M |
| `gauge_epochs`, if every snapshot rewrote ~800 rows (+ PK index) | ~14 M (avoid) |
| Mirror steady state (~18 k activity rows × 9 index entries + votes, locks, deposits) | ~0.3 M |
| Mirror initial load or one full resync | ~2.5 M, one-off |
| External fetches, prices, stats | ~0.1 M |
| **Total (recommended design)** | **≲ 3 M of 50 M included** |

- Storage: mirror ≈ 0.3 GB, 24 h of snapshots ≤ 0.3 GB, `gauge_epochs` ≈
  80 MB a year: well under 5 GB.
- Reads: a snapshot route reads 1–2 rows; an activity page ≤ ~100. Ten
  million requests a month is ≈ 1 B rows read, against 25 B included.
- Watch `meta.rows_written` per job in logs and the D1 dashboard.

## 8. Pro and Classic migration

Both UIs become API clients through the same front door as third parties.

- Org "Matchbox" in the developer console, apps "Matchbox Pro" and
  "Matchbox Classic", each with a live environment, a secret key and a quota
  override.
- The key is a Worker secret (`MATCHBOX_API_KEY`). Transport is a service
  binding `MATCHBOX_API` → `matchbox-developer-api` (no public hop), falling
  back to `https://api.matchbox.markets` where the binding is absent (local
  dev). The request still carries `Authorization: Bearer <key>`, so auth,
  limits, logs and kill switches apply unchanged.
- The secret key never reaches a browser: browsers call their own Worker's
  `/api/*`, which calls the API.
- Step 1 per route family: keep the existing route path and wire schema,
  reimplement it as a mapper over API responses, behind
  `PRO_DATA_SOURCE` / `CLASSIC_DATA_SOURCE` (`api` | `legacy`) flags. No UI
  change. Step 2, after a clean week: delete the RPC and Neon code for that
  family.
- Pro never gets `MATCHBOX_WAREHOUSE_URL`: Phase 2 replaces GO-LIVE step 8.

### 8.1 Pro Worker routes

| Pro route | Today | API | Phase |
| --- | --- | --- | --- |
| `/api/topology` | RPC multicall per isolate, stale-while-revalidate | `/v1/gauges` + `/v1/incentives?epoch=current` | 1 |
| `/api/pricing/btc`, `/api/pricing/mezo` | Skip oracle, Base pool | `meta.prices`; `/v1/prices` | 1 |
| `/api/protocol/activity` | Neon | `/v1/activity` | 2 |
| `/api/wallets/:a/activity` | Neon | `/v1/wallets/{n}/{a}/activity` | 2 |
| `/api/activity/tx/:hash` | Neon | `/v1/activity/tx/{n}/{hash}` | 2 |
| `/api/history/status` | Neon + config | `/v1/status` | 2 |
| `/api/incentives/epochs` | RPC, warehouse deposits | `/v1/incentives/epochs` | 2 |
| `/api/vote/validators` | RPC, stale-while-revalidate | `/v1/validators?include=incentives,profile` | 3 |
| `/api/vote/pools` | RPC | `/v1/pools?include=incentives` | 3 |
| `/api/vote/prices` | `api.mezo.org` `priceUsd` | `/v1/prices?include=market` | 3 |
| `/api/pricing/epochs` | archive reads, `HISTORY_KV` | `/v1/prices/epochs` | 3 |
| `/api/gauges/:a/epochs` | supply checkpoints, archive `getBoost`, close prices | `/v1/gauges/{n}/{a}/epochs` (with backfill) | 3 |
| Browser hooks: locks, votes, used weights, last voted, `earned` | browser RPC | Pro Worker proxies to `/v1/wallets/{n}/{a}/locks`, `votes`, `claimable` | 4 |
| `/api/wallets/:a/earnings`, `ledger`, `ledger.csv` | RPC checkpoints + Neon claims | `/v1/wallets/{n}/{a}/earnings`, `ledger`, `ledger.csv` | 5 |
| Vote page optimizer | client-side shared optimizer | unchanged (instant re-optimization while editing); same package as `POST /v1/optimize` | 6 |
| `/api/query`, `/api/mcp` (Stuart tools) | RPC, Neon, external | tools call the API through the binding | 7 |
| `/api/health`, `/api/proposal/refresh`, `/api/support-report` | local | unchanged | — |

Order follows the phases. Phase 2 should land before Pro's first production
deploy, so Pro never needs a Neon credential.

### 8.2 Classic

| Classic source | API | Phase |
| --- | --- | --- |
| `/api/analytics/gauge-topology` | `/v1/gauges` + `/v1/incentives` | 1 |
| `/api/activity`; `/api/mezo-gauges/emissions`, `locks`; warehouse snapshot owners and votes | `/v1/activity?compat=explorer`, `/v1/emissions`, `/v1/stats/locks`, `/v1/votes` | 2 (Classic drops `MATCHBOX_WAREHOUSE_URL`) |
| `/api/validators/[network]` | `/v1/validators` | 3 |
| `/api/pools/[network]`, `/api/votables/[network]` | `/v1/pools` | 3 |
| `/api/pricing/mezo`, `/api/pricing/tokens` | `/v1/prices` | 3 |
| `/api/remote-pools`, `/api/mezo-gauges/liquidity` | `/v1/venues` | 3 (decide) |
| `/api/mezo-gauges/snapshot`, `history` | `/v1/gauges?voter=third-party`, `/v1/votes/by-wallet`, `/v1/stats`, `/v1/stats/epochs` | 2–3 |
| `/api/mezo-gauges/merkl` | `/v1/merkl` | 3 (decide) |
| `/api/mezo-id/[network]` | `/v1/accounts/{n}/{id}` | 3 (decide) |
| Supabase `gauge_history` (gauge detail chart) | `/v1/gauges/{n}/{a}/epochs` | 3, after backfill |
| Browser RPC: locks, votes, claimables, whitelisted tokens | wallet routes, `/v1/tokens` | 3–5 |

Classic's Next routes become thin adapters first, as in Pro. Its "as of"
chip reads `meta.freshness`.

## 9. Phases

| Phase | Scope | Depends on | Effort | Exit criteria |
| --- | --- | --- | --- | --- |
| 1 | Market snapshot core (§2.1) | — | in progress | Live; Pro `/api/topology` and Classic gauge topology served from it |
| 2 | Warehouse mirror and activity: `MIRROR_DB`, migration `0012`, sync, initial load; `/v1/activity`, `/activity/tx`, `/v1/incentives/epochs`, `/v1/votes`, `/v1/votes/by-wallet`, `/v1/emissions`, `/v1/stats/locks`, `/v1/status`, wallet `activity`; Classic and Pro activity cutover | 1 | ~1.5 weeks | Classic and Pro read no Neon; activity pages diff-identical to the direct warehouse reads; sync lag < 20 min for a week |
| 3 | Market completeness: prices (+ epoch close), tokens, stats, validators, pools (+ Mezo API metrics), boost subscription fields, `include=profile`, third-party gauge profiles, gauge-history backfill; venues, Merkl, accounts if approved | 1 (2 for backfill amounts) | ~2 weeks | Pro `/api/vote/*`, `/api/pricing/*`, `/api/gauges/:a/epochs` and Classic market routes on the API; `record-gauge-history` retired |
| 4 | Wallet state: `locks`, `votes` (+ projected), `claimable` (live), `gauges`, `troves`; `live=true`; `wallet`, `wallet-live` classes | 2 | ~1.5 weeks | Pro and Classic wallet hooks served by their Workers from the API; golden tests for voting power and `earned` at a fixture block |
| 5 | Wallet history: A6 sealed earnings in the indexer (+ golden: tokenId 111, `0x18bE…1baA`, 702.670804524943038744 MEZO), mirror, `earnings`, `ledger`, CSV; sealed `claimable` default | 2, 3 (close prices) | ~2–2.5 weeks | Pro `/api/wallets/:a/earnings` and `ledger` on the API; Σ sealed claimable = `earned()` within 1 wei on the golden set |
| 6 | Optimizer and opportunities; `compute` class | 3; shared optimizer on `main` | ~3 days | API ballot = Pro ballot for fixture wallets |
| 7 | Cleanup and consumers: delete legacy paths and flags; Stuart tools and `packages/matchbox-mcp` call the API; SDK 1.x covers all routes; console docs | 2–6 | ~1 week | No RPC, Neon or external reads left in Pro/Classic Workers except writes and Stuart-only tools |
| 8 (option) | Warehouse on D1 (≈ 285 MB): D1 store for the indexer, batch-atomic projection windows, BigInt aggregation; Neon retired; testnet pilot first | 5 | ~2–3 weeks | Row-for-row parity with Neon after a replay; Neon at 0 CU-h |

Phases 2 and 3 are independent (mirror path vs RPC/ext path) and can run in
parallel. Phase 4 needs the mirror for token sets; Phase 5 needs Phase 3's
close prices.

Phase 8 trade-offs: it removes Neon, the sync, and the 1 GB storage ceiling
(~27 months away at current growth), and makes history as fresh as the
tick. It costs a port of `pg-store` and the projection's `BEGIN`/`COMMIT`
windows to D1 batches, Postgres `numeric(78,0)` arithmetic to BigInt, and ad
hoc SQL on Postgres. Decide after Phase 5.

## 10. Risks and open questions

Owner decisions:

1. **Third-party token pricing.** Phase 1 prices only registry tokens.
   Options: (a) keep `totalUsd` and `aprPercent` registry-only and expose
   market prices separately with `source` (recommended: APRs stay
   reproducible); (b) fold `api.mezo.org` `priceUsd` into totals with a
   `mezo-api` source; (c) GeckoTerminal as Classic does today. Pro currently
   folds pool-API prices in where no reference price exists, so (a) changes
   a Pro number.
2. **Republishing Mezo and third-party data** (pools API, votables, accounts,
   GeckoTerminal, DexScreener, Curve, Merkl). Classic proxies `api.mezo.org`
   with a spoofed `Origin`; a public API re-serving it needs Mezo's
   agreement and each source's terms. Without it, M16, M18–M20 stay
   UI-only or link out.
3. **Archive RPC** for backfill and epoch-close prices (`getBoost`, Skip
   oracle, Base `slot0` at past blocks): which provider, which limits. Pro
   already does archive reads; confirm the endpoint and whether Base public
   RPC keeps enough history.
4. **Legacy `gauge_history` import**: accept float-derived USD with a
   `legacy-gauge-history` source, or recompute everything from deposits and
   close prices and drop pre-warehouse rows that cannot be recomputed.
5. **Scope model**: one public-data scope vs `market:read` + `wallets:read`
   (recommended), both auto-approved. Decide before Phase 2 so live keys do
   not need re-review later.
6. **Testnet history**: the indexer is mainnet-only. Options: (a) testnet
   indexer writes D1 directly, piloting Phase 8 (recommended); (b) a second
   Neon Free project. Until then testnet mirror routes answer `state:
   "unavailable"`.
7. **Wallet freshness**: mirror data lags up to ~17 min after a user's
   transaction. Recommended: UIs overlay their own receipts and use
   `live=true` right after a write. Alternative: a faster tick (`*/12`).

Engineering risks and questions:

8. **Per-wallet limits and scraping**: wallet data is public, but the API
   makes profiling cheap. Proposed: per-wallet bucket on `wallet-live`,
   addresses never logged, no identity joins, optional distinct-wallets cap
   per key.
9. **`claimable` before A6**: Phase 4 serves it live (bounded multicall per
   wallet). Alternative: the API cron snapshots `earned()` for every active
   (tokenId, reward contract, token) triple every 15 min (~25–40 k calls, ~200
   multicalls). Recommended: live in Phase 4, sealed math in Phase 5.
10. **D1 write budget**: rewriting every gauge's history row every 5 minutes
    alone would cost ~14 M rows a month; Phase 1 should gate history writes
    on payload changes (§7.5). Check `meta.rows_written` after launch.
11. **D1 throughput and latency**: each database is single-threaded; two
    databases plus read replication and in-isolate snapshot memos keep
    request load off the primary. Load-test the activity routes at Pro's
    peak before cutover.
12. **Mirror correctness**: watermark bugs drop rows silently. Mitigation: a
    daily count check per stream (Neon count vs D1 count, inside a tick) and
    a `sync_state` lag alert at 45 min.
13. **Snapshot consistency**: RPC providers can return different blocks per
    call. Every snapshot pins one block for all Mezo reads (as the
    chain-state cron does); Base reads record their own block.
14. **First-party quota**: all Pro users share one key. Size overrides from
    Pro's current request volume; the Pro Worker keeps its own per-user
    limits and response caches.
15. **Enum growth**: new `priceSource`, `kind` and `actionType` values are
    additive only if clients tolerate unknown values. The SDK must not
    reject them; contract tests enforce it.
16. **Gauge count growth**: the unpaginated gauge list is fine at ~800
    gauges; add a cursor (additive) before ~2,000 or 1 MB.
17. **Classic vs Pro activity semantics** differ on purpose
    (`explorer_parity`). The API serves both; `compat=explorer` is retired
    once Classic's claim drawers handle veBTC lock ids.
