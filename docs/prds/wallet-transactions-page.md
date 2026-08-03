# PRD: Wallet Transactions (`/transactions`)

**Status:** Draft for agent handoff — open decisions resolved (see §11)  
**Product:** Matchbox (Mezo gauge / incentives app)  
**Repo:** `MallardLabs/MatchBox` (local path: `C:\Users\pykew\hackathon\Matchbox`)  
**Author context:** Extends the existing Goldsky activity stack into a **wallet-scoped transactions experience**, starting from the wallet drawer, with subgraph coverage expanded for LP/vault capital moves and full claim history.  
**Related surfaces today:** `/activity` (global protocol explorer), `WalletDrawer` (balances + send/receive), `/dashboard` (portfolio state, no historical ledger)

---

## 1. Problem

Connected Matchbox users can:

- vote, claim, lock, boost, deposit incentives, and interact with Mezo DeFi elsewhere;
- see a **global** protocol feed at `/activity`;
- see **current** balances/claimables on dashboard and wallet drawer;

…but they **cannot** open a personal ledger of *their* Mezo actions from the wallet UI.

Gaps that matter:

| Need | Today |
|------|--------|
| “What did *I* do on Mezo recently?” | Only via global `/activity` + manual mental filter, or Academy actor URLs |
| Entry from wallet drawer | No Transactions item (Send / Receive only) |
| LP add/remove, DEX swaps, vault stake/unstake, multi-token vote claims | Partially or not indexed in `matchbox-explorer` |
| Stable deep link | No first-class `/transactions` route |

This is **not** Matchscan (full explorer). It is a **personal activity ledger** for the connected smart-account / EVM actor.

---

## 2. Goals

### Primary goals

1. **Personal timeline** of the connected wallet’s Mezo activity, newest first.
2. **Entry points:**
   - Wallet drawer → **Transactions** (primary);
   - Full page **`/transactions`** (deep link, “View all”, mobile).
3. **One normalized feed** powered by Goldsky (extend `apps/activity-subgraph` / `matchbox-explorer`, not a parallel ad-hoc RPC log scanner for v1).
4. **Filterable** by action family (locks, votes, claims, capital, transfers optional).
5. **Explorer links** per row (`explorer.mezo.org` / testnet).
6. **Reuse** existing `mezoActivity` formatters, enrichment, pagination, and BFF patterns.

### Non-goals (v1)

- Full token Transfer noise for every ERC-20 (unless product explicitly wants it later).
- Historical USD P&amp;L / tax lots (capability map already flags this as a larger gap; out of scope here).
- Cross-chain history (Ethereum bridges, etc.).
- Replacing global `/activity` system tab.
- Matchscan-scale explorer features.
- Off-chain MATS / points ledgers.

---

## 3. Users & identity

### Persona

**Connected Mezo participant** (veMEZO / veBTC holder, LP, vault user) who wants an audit trail of their Matchbox-related actions.

### Address semantics (critical)

| Address | Role |
|---------|------|
| `accountAddress` (EVM / Passport smart account) | **Canonical actor** for subgraph queries (`actor`) |
| Bitcoin-family `walletAddress` | Receive BTC; **do not** use as primary GraphQL actor |

Implementation must query with the **EVM smart account** used for on-chain Matchbox txs. Document behavior when only BTC is connected and the smart account is not ready (empty state + setup CTA using existing `WalletSetupView` patterns).

---

## 4. Product experience

### 4.1 Wallet drawer

**File today:** `apps/webapp/src/components/WalletDrawer/index.tsx`  
**Views today:** `"main" | "send" | "receive" | "setup"`

**Add:**

1. Extend `DrawerView` with `"transactions"`.
2. On main view, beside Send / Receive, add **Transactions** (or a third action button).
3. `TransactionsView`:
   - Last **N** events for the connected EVM actor (suggest N = 10–20).
   - Compact rows: icon, short label, amount(s), relative time, external link.
   - Footer: **View all** → `router.push("/transactions")`.
   - Empty: “No activity yet” + link to `/activity` or docs if useful.
   - Loading / error + retry (React Query).

### 4.2 Full page `/transactions`

**Route:** `apps/webapp/src/pages/transactions.tsx` → page component  
**Pattern to copy:** `pages/activity.tsx` + `MezoActivityPage` (dynamic import, `ssr: false` if wallet-dependent).

**Requirements:**

- Requires connection (prompt connect if not).
- Uses EVM actor filter always (not global feed).
- Filters, date range, pagination (reuse `/api/activity` or dedicated `/api/transactions` thin wrapper).
- Filters UX: chips for action families (see §5).
- Group multi-log txs optionally (reuse `groupActivityByTx` from `lib/mezoActivity/normalize`).
- Enrichment: gauge names, pool symbols, token icons (`useActivityEnrichment`, `TokenIcon`, gauge profiles).

### 4.3 Navigation

| Placement | Action |
|-----------|--------|
| Wallet drawer | Primary entry |
| Header `more` menu | Optional: add `/transactions` next to `/activity` |
| Global `/activity` | Keep as **protocol explorer**; do not remove. Clarify copy if needed: “Explore all protocol activity” vs “Your transactions”. |

### 4.4 Labels (user-facing examples)

| Action | Short label |
|--------|-------------|
| Lock created / increased / extended | Created lock / Increased lock / Extended lock |
| Lock withdrawn | Withdrew lock |
| Boost vote / abstain / poke | Voted / Reset votes / Poked boost |
| Incentive added | Added incentive |
| Rebase claimed | Claimed rebase |
| Vote fee / bribe claimed | Claimed fees / Claimed incentives |
| mUSD savings deposit / withdraw / yield | Deposited into savings / Withdrew from savings / Claimed savings yield |
| LP add / remove | Added liquidity / Removed liquidity |
| LP or vault gauge stake | Staked LP / Unstaked LP |
| Vault deposit / withdraw | Deposited into vault / Withdrew from vault |
| DEX swap | Swapped X for Y |
| Native / ERC-20 send (if in scope) | Sent / Received |

Prefer short labels + tooltip/detail for pool name, gauge, tokenId, raw amounts.

---

## 5. Action catalog & coverage matrix

Use this matrix for phased delivery. **Indexed today** = already in `apps/activity-subgraph` as `ActivityEvent` action types (see `schema.graphql` + `types/mezoActivity.ts`).

### 5.1 Already indexed (ship UI first)

| Family | Action types (subgraph enum) | Notes |
|--------|------------------------------|--------|
| Locks (veMEZO / escrow) | `LOCK_*` | Strong coverage; prev/post snapshots |
| Boost / pair | `BOOST_VOTE`, `BOOST_ABSTAIN`, `BOOST_POKE`, `PAIR_CREATED`, … | Matchbox vs Mezo pair via `boostContext` |
| Pool / validator votes | PoolsVoter / validators / third-party | Gauge + pool fields |
| Incentives | `INCENTIVE_ADDED`, `REWARD_*` | Includes notify/distribute |
| Rebase / merkle | `REBASE_CLAIMED`, `MERKLE_CLAIMED` | User claims |
| mUSD savings | `SAVINGS_DEPOSIT`, `SAVINGS_WITHDRAW`, `SAVINGS_YIELD_CLAIMED` | Vault-like already |
| System | epoch, PCV, splitters | **Exclude by default** from wallet feed |

**Phase 0 / MVP product:** wallet-scoped feed of **user** action types only, powered by existing `matchbox-explorer` + `/api/activity?actor=`.

### 5.2 Must add to subgraph for “full” product vision

| Family | Phase | Why | Suggested action types | Indexing approach |
|--------|-------|-----|------------------------|-------------------|
| **VeBTC voting escrow** | **1** | Confirmed gap: only `VeMEZO` is a dataSource; mainnet `veBTC` (`0x38E3…`) not indexed (see §11.D5) | Existing `LOCK_*` | Second VotingEscrow dataSource reusing `voting-escrow.ts`; accurate startBlock; deploy + `live` tag |
| Vote earnings claims (VotingReward fee/bribe) | 1 | Users claim fees/incentives via voter contracts | `VOTE_FEE_CLAIMED`, `VOTE_BRIBE_CLAIMED` | Index `ClaimRewards` on bribe/fee reward templates (factory create already partially mapped via bribes) |
| Chain fee claims (user) | 1 | Personal claims ≠ ChainFee**Splitter** system events already indexed | `CHAIN_FEE_CLAIMED` | Dedicated distributor `Claimed` handler if product still wants it |
| LP add/remove (v2 + CL) | 2 | Capital movement not in Matchbox explorer | `LP_ADDED`, `LP_REMOVED` | New dataSources: pool factory + CL position manager / known routers; or consume/mirror Mezo `earn-pools` events into unified `ActivityEvent` |
| LP gauge stake/unstake | 2 | Distinct from principal | `LP_STAKED`, `LP_UNSTAKED` | Gauge `Deposit`/`Withdraw` with user from event params |
| Other vaults (Morpho, Mellow, VaultGauge) | 2 | Beyond mUSD savings | `VAULT_DEPOSIT`, `VAULT_WITHDRAW`, `VAULT_STAKED`, … | Per-vault dataSources or factory templates; start with known addresses in `packages/shared` contracts |
| DEX swaps | 3 | User “transacted” | `SWAP` | UniversalRouter / pool Swap → user resolution (harder; or hop-aggregate like Mezo `UserSwap`) |

### 5.3 Explicitly out of scope unless product says yes

- Arbitrary ERC-20 `Transfer` spam  
- Failed txs / mempool  
- Cross-app Mezo Portal bridge history (unless deep-linked later)

---

## 6. Architecture

### 6.1 Current stack (do not reinvent)

```
Wallet / Page
  → React Query hook
  → Next BFF  GET /api/activity?...
  → Goldsky GraphQL  matchbox-explorer (live tag)
  → apps/activity-subgraph handlers
```

**Key files:**

| Layer | Path |
|-------|------|
| Subgraph package | `apps/activity-subgraph/` |
| Schema | `apps/activity-subgraph/schema.graphql` |
| Deploy | `pnpm --filter @repo/activity-subgraph deploy:mezo` → `matchbox-explorer/3.2.2` |
| Goldsky URLs | `apps/webapp/src/lib/mezoActivity/dataSources.ts` (`MATCHBOX_EXPLORER_SUBGRAPH_MEZO_URL`) |
| BFF | `apps/webapp/src/app/api/activity/route.ts` |
| Normalize/format | `apps/webapp/src/lib/mezoActivity/*` |
| Types | `apps/webapp/src/types/mezoActivity.ts` |
| Hook | `apps/webapp/src/hooks/useMezoActivity.ts` |
| Global UI | `apps/webapp/src/components/pages/MezoActivityPage.tsx` |
| Wallet | `apps/webapp/src/components/WalletDrawer/` |

### 6.2 Target architecture

```
WalletDrawer TransactionsView  ─┐
/transactions page             ─┼→ useWalletTransactions
                                 → GET /api/transactions (or /api/activity)
                                 → fetchMezoActivity({ actor: evmAddress, actionTypes: USER_* })
                                 → Goldsky matchbox-explorer
```

**Prefer extending `matchbox-explorer`** over a second subgraph unless indexing volume/start blocks force isolation. Rationale:

- Single `ActivityEvent` model already exists and is normalized for UI.
- `/api/activity` already supports `actor`, `actionTypes`, time range, pagination.
- Version bump + tag (`live`) is the existing deploy model.

If a **separate** subgraph is required later (e.g. high-volume Transfer indexing), still **project into the same BFF shape** so the UI only knows one DTO.

### 6.3 Goldsky / subgraph implementation notes

- Network slugs: `mezo` / `mezo-testnet` (Goldsky).
- Deploy: `goldsky subgraph deploy matchbox-explorer/<semver> --path .` then tag `live`.
- Entities: keep `@entity(immutable: true)` for append-only activity rows.
- IDs: `txHash-logIndex` (existing pattern).
- Always lowercase addresses in mappings for consistent filters.
- Factories/templates for dynamic bribe/pool contracts.
- Set accurate `startBlock` per contract (backfill cost).
- Prefer subgraph over Turbo for this product; Turbo only if we later need Postgres + heavy joins.

### 6.4 User filter query (subgraph)

```graphql
{
  activityEvents(
    first: 50
    orderBy: timestamp
    orderDirection: desc
    where: {
      actor: "0x..."
      actionType_in: [LOCK_CREATED, BOOST_VOTE, REBASE_CLAIMED, SAVINGS_DEPOSIT /* … */]
      timestamp_gte: "…"
      timestamp_lte: "…"
    }
  ) { id actionType amount token txHash timestamp … }
}
```

Also consider `or: [{ actor: $a }, { recipient: $a }, { txFrom: $a }]` for receives — only if product wants inbound transfers; v1 can stick to `actor`.

### 6.5 API contract

**Phase 0 (locked — §11.D2):** **Option A** — reuse `GET /api/activity`:

- Client passes `actor` (connected EVM address) + wallet user `actionTypes`.
- No wallet auth (on-chain public; same as Academy).
- Prefer validating `actor` with `isAddress` when present.
- Same `MezoActivityApiResponse` shape.

**Optional later — Option B:** `GET /api/transactions` that defaults `actionTypes` to the wallet user set, returns richer `meta.coverage` (indexed vs planned families). Still public `actor`; still BFF-only Goldsky.

Do **not** call Goldsky from the browser; keep BFF.

### 6.6 Client hook

`useWalletTransactions`:

- `enabled` when network ready + EVM address present;
- queryKey: `["wallet-transactions", network, address, filters, page, from, to]`;
- invalidate on successful claim/vote/lock mutations (invalidateQueries prefix) so drawer updates.

---

## 7. Phased delivery

### Phase 0 — MVP (UI-only, existing subgraph)

**Goal:** Ship personal timeline without new indexing. Decisions locked in §11.

1. Wallet drawer Transactions view (last **15** rows) + **View all** → `/transactions`.
2. Page `/transactions` with filters for families already covered (locks, boost, incentives, savings, rebase/merkle claims).
3. Wire actor = EVM smart account (`useWalletAccount().accountAddress`); never BTC `walletAddress`.
4. Default `actionTypes` = `USER_ACTION_TYPES_GRAPHQL` (+ `LOCK_TRANSFERRED`; see §11.D3 / §11.D6). Exclude system types.
5. Reuse `GET /api/activity` (no new auth). Client always passes `actor` + user action types.
6. No Header `more` menu entry in Phase 0 (Phase 3 polish).
7. Tests: hook + empty/error states; light formatter tests if new labels.

**Exit criteria:** Connected user sees their lock/vote/claim/savings history from drawer and full page. Global `/activity` unchanged.

### Phase 1 — Claim completeness + veBTC locks

1. **VeBTC escrow dataSource** (confirmed missing — §11.D5): reuse voting-escrow handlers; deploy + tag `live`.
2. Index VotingReward `ClaimRewards` → fee/bribe claim events with token, amount, tokenId, pool/gauge if known.
3. Chain fee **user** claims if still product-desired (not the existing ChainFeeSplitter system events).
4. Labels: Claimed fees / Claimed incentives / Claimed chain fees; veBTC lock labels reuse lock family.
5. Bump subgraph version; update env/live tag; extend `ACTION_TYPE_MAP` + formatters; add `LOCK_TRANSFERRED` to shared user/wallet constants if not done in Phase 0.

### Phase 2 — Capital: vaults + LP

1. **Vaults:** Morpho / Mellow / vault gauges for known Mezo vaults (contract list in shared config).
2. **LP:** add/remove liquidity + optional stake/unstake.
3. UI dual-amount rows for two-sided LP.
4. Coverage badges in meta if partial.

### Phase 3 — Swaps & polish

1. DEX swap history (user-resolved) — same product stream, not a separate app.
2. Optional group-by-tx collapse in UI (`groupActivityByTx` already exists).
3. CSV export for personal feed (mirror `MezoActivityPage` export).
4. Optional Header `more` menu entry (`transactions` next to `activity`).

---

## 8. UX / design constraints

From `agent-instructions/ui-and-react.md` and existing Matchbox UI:

- Tailwind + CSS variables (`--surface`, `--content-primary`, …).
- No semicolons; Biome; default export for single-export modules.
- React Query for all client fetching.
- Financial amounts: integer bigint + format utilities; never float for chain amounts (`agent-instructions/financial-precision.md`).
- Accessible buttons, loading states, empty states.
- Match existing WalletDrawer spacing, rounded cards, mono amounts.
- Relative time + absolute date on full page.

---

## 9. Testing & QA

### Automated

- Subgraph: matching tests if adding handlers (matchstick if already used; otherwise handler unit patterns in-repo).
- Webapp: unit tests for action-type filters, actor selection, serialization.
- API route: query param validation (`actor` must be address).

### Manual QA checklist

- [ ] BTC wallet with smart account ready: drawer shows EVM-scoped events.
- [ ] Smart account not ready: empty state + setup CTA, no crash.
- [ ] Mainnet / testnet toggle: correct subgraph endpoint.
- [ ] After lock / vote / claim: invalidate refreshes list.
- [ ] Multi-log claim tx: multiple rows or grouped correctly.
- [ ] Explorer link opens correct network explorer.
- [ ] System events never appear in wallet feed by default.
- [ ] Global `/activity` still works for non-connected users.

### Risk

| Risk | Mitigation |
|------|------------|
| Subgraph lag after claim | Invalidate + “Indexing may take a minute” copy |
| Version pin drift (`3.2.2` vs `live`) | Prefer env URL with `live` tag; document deploy |
| Actor mismatch (BTC vs EVM) | Always document + test Passport address sources |
| Handler backfill time | Phased contracts; startBlocks per deploy |
| Scope creep into full P&amp;L | PRD non-goals |

---

## 10. Success metrics

- Wallet drawer Transactions opened (analytics event if product wants; optional).
- `/transactions` page views among connected users.
- Support / Discord reduction in “where is my claim history?” questions.
- Coverage: % of user-facing Matchbox write actions that appear in feed within indexing lag.

---

## 11. Resolved decisions (Phase 0)

Evidence checked against current repo (`apps/webapp`, `apps/activity-subgraph`) on handoff. Treat these as **locked** unless product explicitly reopens them.

### D1 — Surfaces: drawer **and** full page

| | |
|--|--|
| **Decision** | Ship **both**: drawer preview (last **15**) + full page `/transactions`. |
| **Rationale** | Wallet drawer is the natural audit-trail entry next to Send/Receive; full page is required for filters, date range, pagination, deep links, and mobile. Matches how global `/activity` already works as a dedicated page. |
| **Phase 0 nav** | Primary: drawer. Secondary: “View all” → `/transactions`. **No** Header `more` item yet. |
| **Phase 3** | Optional Header entry next to `/activity` (`Header.tsx` already lists `activity` under `more`). |
| **Copy** | Keep `/activity` as protocol explorer. Wallet surfaces: “Your transactions” / “No activity yet”. |

### D2 — API auth: public `actor`, no wallet auth

| | |
|--|--|
| **Decision** | **Option A for Phase 0:** reuse `GET /api/activity` with client-supplied `actor` + user `actionTypes`. No session/auth gate. |
| **Rationale** | Activity is on-chain public data. `/api/activity` already accepts optional `actor` with CORS `*` and no auth (same pattern as Academy actor/profile endpoints). Adding auth would block deep links, shareable actor URLs later, and simple caching. |
| **Client rules** | Wallet UI always passes **connected EVM** `accountAddress` from `useWalletAccount` — never BTC `walletAddress`. Page may later accept `?actor=` for shareable views; default remains connected wallet. |
| **Server rules** | Validate `actor` with `isAddress` / `getAddress` when present (today `/api/activity` does **not** validate; tighten when wiring transactions or as a small shared fix). Cap `limit` (already 1–1000). Do **not** call Goldsky from the browser. |
| **Rate limit** | **Not a Phase 0 product gate.** Existing activity BFF has no dedicated rate limiter; do not invent one solely for this feature. Ops can add edge/WAF limits later if abuse appears. |
| **Option B** | Thin `GET /api/transactions` (defaults user action types + richer `meta.coverage`) is **optional Phase 1+ polish**, not required for MVP. |

### D3 — Identity filter: `actor` only (v1)

| | |
|--|--|
| **Decision** | Wallet feed `where` uses **`actor = evmAddress` only**. Do not OR `txFrom` or `recipient` in Phase 0. |
| **Rationale** | Handlers attribute user principal to `actor` (locks → `provider` / owner, votes → voter, savings → `user`, claims → claimer). `txFrom` is the tx sender and can be a relayer/smart-account bundler, not the logical user. `recipient` is inconsistently used (e.g. `LOCK_TRANSFERRED` sets `actor = to`, `recipient = from`). Academy and activity already key off `actor`. |
| **Known gap** | Outbound lock transfers: sender is stored in `recipient`, so under `actor`-only filter the **sender does not see** the transfer row; the **receiver does**. Accept for v1; document in UI only if users report confusion. |
| **Later (Phase 1+)** | Optional: for `LOCK_TRANSFERRED` only, `or: [{ actor: $a }, { recipient: $a }]`. Do not generalize `txFrom` matching without a clear product reason. |
| **Inbound ERC-20** | Out of scope (see non-goals). |

### D4 — Capital / swaps stay in this roadmap (not a separate product)

| | |
|--|--|
| **Decision** | LP + vaults = **Phase 2** of this PRD; DEX swaps = **Phase 3**. Same UI, same BFF DTO, extend `matchbox-explorer`. |
| **Rationale** | Product is one personal ledger. A second app/subgraph only if indexing volume or start-block cost forces isolation — still project into the same activity shape. |
| **Phase 0** | No LP/swap/vault work beyond existing mUSD savings. |

### D5 — veBTC escrow: **not indexed today** → Phase 1 subgraph work

| | |
|--|--|
| **Decision** | Phase 0 **will not** show veBTC lock create/increase/extend/withdraw history. Only **VeMEZO** escrow is a dataSource today. Track veBTC + chain-fee user claims as **Phase 1 indexing**. |
| **Evidence** | Live `apps/activity-subgraph/subgraph.yaml` dataSources include `VeMEZO` (`0xb90f…`), Boost/Pools/ThirdParty/Validators voters, splitters, minter, rebase/merkle distributors, mUSD savings, PCV, bribe template — **no `VeBTC` dataSource**. Shared contracts list mainnet `veBTC` at `0x38E3…` / testnet `0x3D4b…` (`packages/shared`). README documents veMEZO Deposit + votes **on** veBTC boost gauges, not veBTC lock events. `build/VeBTC/` artifacts exist from tooling history; they are **not** in the deployed yaml. |
| **What users still see for “veBTC” surfaces** | Boost votes / abstains / incentives against boost gauges (actor = veMEZO voter). That is correct Phase 0 behavior. |
| **Phase 1 work** | Add VotingEscrow dataSource for VeBTC (reuse `voting-escrow.ts` handlers; distinct `source` if needed), startBlock, deploy version bump + `live` tag. Index chain-fee **user Claimed** if product still wants it (ChainFee**Splitter** today is system period/nudge, not personal claims). |
| **UI honesty** | Optional Phase 0 empty-state or coverage note: “veBTC lock history coming soon” only if we surface a coverage badge; otherwise silent until indexed. Prefer silent + Phase 1 over a half-empty badge unless design wants it. |

### D6 — Default action-type set for wallet feed

| | |
|--|--|
| **Decision** | Default = `USER_ACTION_TYPES_GRAPHQL` from `lib/mezoActivity/constants.ts`, **plus** `LOCK_TRANSFERRED`. Never default to system types (`SYSTEM_ACTION_TYPES_GRAPHQL`, including `BOOST_POKE`). |
| **Current user set** | Locks (create/increase/extend/withdraw/permanent/unlock/merge), boost vote/abstain, incentive added, rebase/merkle claimed, mUSD savings deposit/withdraw/yield. |
| **Add in Phase 0 client filter** | `LOCK_TRANSFERRED` (indexed; omitted from today’s `USER_ACTION_TYPES_GRAPHQL` used by global Activity “user” tab — wallet feed should include it for receivers; see D3). Prefer extending a shared `WALLET_ACTION_TYPES_GRAPHQL` constant rather than forking lists ad hoc. |
| **Exclude** | System epoch/PCV/splitter/gauge lifecycle/reward distribute-notify/automated pokes. |

### D7 — Smart account not ready

| | |
|--|--|
| **Decision** | If connected but EVM `accountAddress` missing / setup incomplete: show empty state + existing **WalletSetupView** CTA. Do not query subgraph with BTC address. Do not crash. |
| **Rationale** | Matches PRD §3 and current drawer setup patterns. |

### D8 — Grouping, export, enrichment (Phase 0 defaults)

| | |
|--|--|
| **Decision** | Phase 0 full page: **flat list** (no group-by-tx by default). Reuse enrichment (`useActivityEnrichment`, icons, explorer links). CSV export and group-by-tx = Phase 3 (code already exists on `MezoActivityPage`). Drawer: compact flat rows only. |

### Summary for implementers

| ID | Lock |
|----|------|
| D1 | Drawer (15) + `/transactions`; no Header link until Phase 3 |
| D2 | Public `/api/activity?actor=`; validate address; no auth |
| D3 | Filter `actor` only |
| D4 | LP/vaults Phase 2; swaps Phase 3; same subgraph |
| D5 | No veBTC lock rows until Phase 1 dataSource |
| D6 | User action types + `LOCK_TRANSFERRED`; exclude system |
| D7 | Setup CTA when smart account not ready |
| D8 | Flat list; export/group later |

---

## 12. Agent handoff prompt

Copy-paste for an implementation agent:

```text
You are implementing Matchbox wallet Transactions in C:\Users\pykew\hackathon\Matchbox.

Read and follow:
- docs/prds/wallet-transactions-page.md (this PRD) — source of truth for scope
- §11 Resolved decisions (D1–D8) — locked; do not re-litigate without product
- CLAUDE.md and agent-instructions/* (biome, no semicolons, financial precision, git)
- Existing activity stack: apps/activity-subgraph, apps/webapp/src/lib/mezoActivity/*,
  apps/webapp/src/app/api/activity/route.ts, MezoActivityPage, useMezoActivity,
  WalletDrawer, USER_ACTION_TYPES_GRAPHQL in lib/mezoActivity/constants.ts

Goals for the first PR (Phase 0 unless told otherwise):
1. Add WalletDrawer "Transactions" view (last 15) scoped to connected EVM smart account.
2. Add /transactions full page reusing GET /api/activity with actor + wallet user action types
   (USER_ACTION_TYPES_GRAPHQL + LOCK_TRANSFERRED). No new auth. No Header nav item yet.
3. Do not break global /activity.
4. Do not index veBTC in Phase 0 (not in subgraph.yaml); note as Phase 1 follow-up.
5. Prefer extending matchbox-explorer for later phases.

Hard rules:
- Query Goldsky only from the Next BFF, never the browser.
- Use React Query; bigint for amounts.
- accountAddress (EVM) only — never BTC walletAddress as GraphQL actor.
- Run lint after changes.
- Keep commits atomic and explain why.

Deliver:
- Working Phase 0 UI
- Short PR description with testing notes
- List of follow-up subgraph action types still missing for Phase 1–2
  (incl. VeBTC escrow dataSource, vote fee/bribe claims)
```

---

## 13. Suggested first PR title

`Add wallet Transactions drawer view and /transactions page (actor-scoped activity)`

---

## 14. Appendix — inventory of high-value existing types

From `ActivityActionType` / `MezoActivityActionType` (non-exhaustive):

`lockCreated`, `lockAmountIncreased`, `lockExtended`, `lockWithdrawn`, `lockPermanent`, `lockPermanentUnlocked`, `lockTransferred`, `lockMerged`, `boostVote`, `boostAbstain`, `boostPoke`, `pairCreated`, `gaugeCreated`, `incentiveAdded`, `rewardDistributed`, `rewardNotified`, `rebaseClaimed`, `merkleClaimed`, `savingsDeposit`, `savingsWithdraw`, `savingsYieldClaimed`, …

Full list: `apps/webapp/src/types/mezoActivity.ts` and `apps/activity-subgraph/schema.graphql`.
