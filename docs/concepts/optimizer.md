# Optimizer — Dual-Sided Bribe Marketplace

## Problem

Two user types with complementary needs:

| User | Has | Wants |
|---|---|---|
| **veMEZO voter** | Voting weight | Best bribe yield per unit of veMEZO |
| **veBTC gauge owner** | Boost gauge + fees | veMEZO votes to increase boost |

Currently, the veMEZO voter sees gauge APY but has no way to assess **marginal return** (what they'd actually earn after their vote dilutes the pool). The veBTC owner has no tool to determine **how much bribe to offer** to attract votes.

---

## Data Available

From existing Matchbox hooks:

```
BoostGauge {
  veBTCTokenId          // Which veBTC lock this gauge belongs to
  veBTCWeight           // veBTC voting power on this gauge
  unboostedVeBTCWeight  // veBTC power without boost
  totalWeight           // Current total veMEZO weight on this gauge
  isAlive
  optimalVeMEZO         // veMEZO needed for 5× boost
  optimalAdditionalVeMEZO  // How much more veMEZO needed for 5×
  boostMultiplier       // Current boost (1×–5×)
}
```

From `useVotables` / `useAPY`:

```
GaugeAPYData {
  totalIncentivesUSD     // Total bribes this epoch
  incentivesByToken[]    // Per-token breakdown (symbol, amount, usdValue)
  apy                    // APY = incentives / (totalVeMEZOWeight × MEZO_price)
  totalVeMEZOWeight
}
```

From subgraph (via earn-api or direct query):

- `needsPokeBoost` — whether boost is stale
- `lastPokeBoostAt` — when boost was last recalculated
- `priorityWeight` — relative importance for bot scheduling

---

## Side A: veMEZO Voter — "Where do I earn most?"

### Current state

User sees: APY column in gauge table.

Problem: APY = `bribesUSD / (currentVeMEZOWeight × MEZO_price)`. This shows what *existing* voters earn, not what *you* would earn after adding your weight.

### Marginal APY

```
yourEpochEarnings = bribesUSD × (yourVeMEZO / (currentWeight + yourVeMEZO))
yourAPY = (yourEpochEarnings / (yourVeMEZO × MEZO_price)) × 52 × 100
```

Two edge cases worth surfacing:

| Scenario | What it means | Optimizer signal |
|---|---|---|
| `currentWeight = 0` | No competitors — you capture all bribes | **"First voter bonus — 100% of bribes"** |
| `currentWeight >> yourVeMEZO` | You're a small fish in a big pool — heavy dilution | **"Dilution warning: your share is <1%"** |

### Suggested rank view

```
Your veMEZO: 12,500 (will allocate 100%)

Rank │ Gauge    │ Bribes    │ Current   │ Your     │ Your share  │ Your est.
     │          │ (epoch)   │ veMEZO    │ veMEZO   │ of bribes   │ epoch earn
─────┼──────────┼───────────┼───────────┼──────────┼─────────────┼───────────
  1  │ Pool X   │ $4,200    │ 0         │ 12,500   │ 100%        │ $4,200  ←
  2  │ Pool Y   │ $8,500    │ 890,000   │ 12,500   │ 1.4%        │ $119
  3  │ Pool Z   │ $1,200    │ 45,000    │ 12,500   │ 22%         │ $264
```

User can toggle allocation sliders to see how projected earnings change across gauges.

---

## Side B: veBTC Gauge Owner — "How much bribe do I need to post?"

### Problem

veBTC owner earns fees (bridge, chain, swap, MUSD revenue) scaled by their boost multiplier. Higher boost = more fee share. But attracting more veMEZO weight requires offering competitive bribes.

### Boost-to-Earnings model

```
currentEarnings   = feeShare × (currentBoost / 5)
potentialEarnings = feeShare × (targetBoost / 5)
additionalEarnings = potentialEarnings - currentEarnings
```

### Bribe cost vs. earnings gain

```
veMEZO needed for target boost:
  targetVeMEZO = ((targetBoost - 1) / 4) × nft_vp × veMEZO_total / veBTC_total
  additionalVeMEZO = max(targetVeMEZO - currentVeMEZO, 0)

Bribe cost to attract that veMEZO:
  You need your gauge's bribe APY to be competitive.
  Required bribe ≈ additionalVeMEZO × targetAPY × MEZO_price / 52

  (targetAPY = the APY a veMEZO voter could earn elsewhere — e.g., top-quartile gauge APY)

ROI:
  netGain = additionalEarnings - requiredBribe
```

### Owner dashboard

```
Your veBTC #42

Current:   1.2× boost  (2,400 veMEZO voting)
Optimal:   1,800 more veMEZO needed for 3×
           8,400 more veMEZO needed for 5×

┌───────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Target│ VeMEZO   │ Bribe    │ Est.     │ Addl.    │ Net      │
│ Boost │ needed   │ cost/wk  │ earnings │ earnings │ gain/wk  │
├───────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 2×    │ 800      │ $24      │ $180     │ $90      │ +$66     │
│ 3×    │ 1,800    │ $54      │ $270     │ $180     │ +$126 ◀  │
│ 4×    │ 4,500    │ $135     │ $360     │ $270     │ +$135    │
│ 5×    │ 8,400    │ $252     │ $450     │ $360     │ +$108    │
└───────┴──────────┴──────────┴──────────┴──────────┴──────────┘

Current weekly earnings (at 1.2×): $90
Max potential earnings (at 5×):      $450
Recommended: 3× boost — best ROI
```

### Competitive benchmark

Show the owner what other gauges are offering:

```
Gauges competing for veMEZO votes:

Gauge #18 (veBTC #18):   2.4% APY, $3,200 bribes/epoch
Gauge #42 (yours):       0.8% APY, $800 bribes/epoch  ← under market
Gauge #7  (veBTC #7):    3.1% APY, $5,100 bribes/epoch

To reach median APY (2.4%), post ~$1,600 more in bribes.
```

---

## Combined View — The Matching Market

The Optimizer can bridge both sides:

```
veMEZO voter sees:          veBTC owner sees:
┌─────────────────────┐    ┌─────────────────────┐
│ Gauges needing      │    │ Voters looking      │
│ your veMEZO:        │    │ for best yield:      │
│                      │    │                      │
│ #42 1.2× needs      │    │ 12.5k veMEZO avail   │
│     1,800 veMEZO    │    │ wants ≥ 2.5% APY     │
│     offering $800   │    │                      │
│                      │    │ Your gauge: 0.8%    │
│ #18 4.8× near cap   │    │ Need $1,600 more     │
│                      │    │ to be competitive   │
│ #7  3.1× stable     │    │                      │
└─────────────────────┘    └─────────────────────┘
```

---

## Implementation Notes

### Data sources

| Data | Source | Already in Matchbox? |
|---|---|---|
| Gauge list + weights | `BoostVoter` contract via `useBoostGauges()` | ✅ |
| Bribe amounts per gauge | `Bribe` contract via `useBribeIncentives()` | ✅ |
| Token prices (USD) | Pyth oracle / `useTokenPrices()` | ✅ |
| veMEZO / veBTC supply | Escrow contract via `useVeSupplyBigint()` | ✅ |
| Current boost per gauge | Computed from weights + supply | ✅ |
| Fee earnings per veBTC | Subgraph / earn-api | Needs wiring |

### New hooks needed

```ts
// For veMEZO voters
useMarginalAPY(userVeMEZO: bigint, gauges: BoostGauge[], bribes: Map<Address, GaugeAPYData>)
  → { gauge: Address, marginalAPY: number, earnings: number }[]

// For veBTC owners
useBribeCalculator(veBTCTokenId: bigint, targetMarketAPY: number)
  → { targetBoost, veMEZONeeded, bribeCost, earningsGain, netGain }[]
```

### Fee earnings per veBTC

The missing piece is estimating a veBTC lock's fee earnings. This could come from:

1. **Subgraph**: The earn-bot subgraph tracks boostable tokens. We could query historical fee distribution.
2. **Earn API**: The portal's earn-api has endpoints for pool/vault stats that could be adapted.
3. **On-chain**: The splitter/PCV contracts distribute fees; we could compute pro-rata share from total fees × veBTC weight / total veBTC weight.
