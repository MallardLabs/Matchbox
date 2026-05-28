# Voting & Poking — Matchbox Reference

## The Two User Types

| Type | What they do in Matchbox | Contract |
|---|---|---|
| **veMEZO voter** | Vote their veMEZO weight onto veBTC boost gauges to earn bribes/rewards | `BoostVoter.vote()` |
| **veBTC gauge owner** | Owns a veBTC lock with a boost gauge; wants their boost multiplier kept up to date | `BoostVoter.pokeBoost()` |

veBTC owners **cannot vote on pool gauges** through Matchbox (not yet). Matchbox is currently a veMEZO boost tool that also displays veBTC gauge data.

---

## Key Contract Functions

| Function | Called on | What it does | Who needs it |
|---|---|---|---|
| `vote(id, gauges[], weights[])` | `BoostVoter` | Resets old votes + applies new ones, normalized to current VP | **veMEZO voter** — 1 tx, always |
| `reset(id)` | `BoostVoter` | Clears all votes, zeroes `usedWeights` | veMEZO voter exiting voting |
| `poke(id)` | `BoostVoter` | Syncs `usedWeights` to current `votingPowerOfNFT` | Bot only — unnecessary for voting |
| `pokeBoost(veBTCid)` | `BoostVoter` | Recalculates a veBTC lock's boost multiplier and writes it to escrow | **veBTC gauge owner** wanting instant freshness |
| `pokeBoosts(ids[])` | `BoostVoter` | Batch version of `pokeBoost` | Bot + optional manual batch |

---

## Vote Flow — 1 Tx, Done

```
vote(veMEZOtokenId, [gaugeA, gaugeB], [8000, 2000])
├─ _reset()              ← clears old votes internally
├─ reads votingPowerOfNFT()  ← at block.timestamp (full decay accounted for)
├─ normalizes: actual = (userWeight × currentVP) / totalUserWeight
└─ applies new allocations
```

No `reset()` call needed first. No `poke()` needed before or after. **Never show unpairing or poking in the vote flow.**

---

## The Bot (Earn Bot)

Runs on Cloudflare cron via `tigris-token-launch/infrastructure/cloudflare/earn-bot/`:

### 1. `pokeTokens()` — UTC :02, :06, :10, :14, :18, :22 (every 4h)

- Pokes up to **10 most-stale veMEZO locks** on BoostVoter
- Selection: `priority = vp_share × vp_change` (biggest impact × most stale)
- Calls `BoostVoter.poke(veMEZOtokenId)` individually
- **Why**: Keeps `usedWeights[tokenId]` in sync with current voting power between vote sessions
- **Does the veMEZO voter care?** No — `vote()` reads fresh VP at `block.timestamp`

### 2. `pokeBoosts()` — UTC :03, :07, :11, :15, :19, :23 (every 4h, offset 1h)

- Pokes up to **50 veBTC boost gauges** via `BoostVoter.pokeBoosts(ids[])` in batches of 5
- Selection: event-driven first (`needsPokeBoost` flag from subgraph), then time-decay (untouched >7d)
- Calls `_getBoost(id)` → writes result to `IVotingEscrow(ve).updateBoost(id, boost)`
- **Why**: When veMEZO weight shifts on a gauge, the boost multiplier is stale until recalculated
- **Does the veMEZO voter care?** Not for their tx. But the boost number shown on gauge cards lags until this runs.

### Schedule Diagram

```
UTC  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
        │     │     │     │     │     │     │     │     │     │     │
        ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼
pokeTokens()  │     │     │     │     │     │     │     │     │     │
at :02        │     │     │     │     │     │     │     │     │     │
         ─────┘  ───┘  ───┘  ───┘  ───┘  ───┘  ───┘  ───┘  ───┘  ───┘
              ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼
        pokeBoosts() │     │     │     │     │     │     │     │     │
        at :03       │     │     │     │     │     │     │     │
```

---

## What Becomes Stale, and When It Fixes Itself

| Action | What goes stale | Auto-fixed by | Latency |
|---|---|---|---|
| veMEZO votes on gauge | Gauge's `weights[gauge]` (veMEZO weight) | Instant — `vote()` updates it immediately | 0 |
| veMEZO vote weight changes | veBTC gauge's `boostMultiplier` | Bot `pokeBoosts()` via subgraph `needsPokeBoost` flag | ≤4h (usually <1h — event-driven) |
| veMEZO lock decays over time | `usedWeights[tokenId]` > actual voting power | Bot `pokeTokens()` by priority | ≤4h for urgent, longer for tiny locks |
| User adjusts lock amount/duration | `usedWeights[tokenId]` < actual voting power | Bot `pokeTokens()` by priority | ≤4h for urgent |

---

## Default Behavior — What Matchbox Should Do

### For veMEZO voters (primary users)

| Step | Default | Why |
|---|---|---|
| Select locks | Auto-select all votable locks | Fewer clicks |
| Enter allocations | User enters percentages per gauge | They decide |
| Click vote | **1 tx: `vote(ids, gauges[], weights[])`** | Contract handles reset + normalization |
| Show result | Success + "Your vote is active" | Done |

**Do NOT show**: unpair step, poke button, reset button, or any pre-vote confirmation about staleness. The contract handles it.

### For veBTC gauge owners (secondary users)

| Step | Default | Why |
|---|---|---|
| View gauge card | Shows `boostMultiplier` + "Last refreshed: Xh ago" | Transparency |
| Auto-refresh | No action needed — bot handles it | 4h cycle is fast enough |
| Manual refresh | **Optional** "Refresh boost now" button on gauge detail page | Power users who want instant |

---

## Offering User Choice — The "Refresh Boost" Button

Only relevant on **veBTC gauge detail pages** (not in the vote flow).

### When to show it

- Only if the viewer is the gauge's veBTC lock owner (verify via wallet)
- Only if the boost is stale (last `pokeBoost` was >5min ago — avoid spam)

### What it says

```
Boost Multiplier: 3.2×
Last refreshed: 2h 14m ago
Next bot refresh: ~15:00 UTC (in 1h 46m)
[Refresh now] — 1 tx, you pay gas
```

### Computing "Next bot refresh"

The `pokeBoosts()` schedule is fixed: **UTC :03 every 4 hours** (03, 07, 11, 15, 19, 23).

```ts
function nextPokeBoostTime(): Date {
  const now = new Date()
  const hours = [3, 7, 11, 15, 19, 23]
  const nextHour = hours.find(h => h > now.getUTCHours())
  if (nextHour !== undefined) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), nextHour, 3, 0, 0))
  }
  // Next day
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 3, 3, 0, 0))
}
```

### No other user choices needed

- **Do NOT** show "Poke veMEZO" in Matchbox — the bot handles this, and `vote()` doesn't need it
- **Do NOT** show "Poke before vote" — misleading, `vote()` handles everything
- **Do NOT** show "Auto in X" in the vote flow — irrelevant, no wait needed

---

## Summary Table

| Concept | Affects | Auto-fix | User action needed? |
|---|---|---|---|
| `vote()` overwrites old votes | Gauge weights | Instant in the same tx | No — just vote |
| Boost multiplier stale after vote shift | veBTC gauge owner's displayed boost | Bot `pokeBoosts()` within 4h | Optional: "Refresh now" button for gauge owner |
| veMEZO `usedWeights` stale from decay | Accounting accuracy | Bot `pokeTokens()` within ≤4h | Never — `vote()` reads fresh VP |
| veMEZO `usedWeights` stale from lock adjustment | Accounting accuracy | Bot `pokeTokens()` within ≤4h | Never — `vote()` reads fresh VP |
