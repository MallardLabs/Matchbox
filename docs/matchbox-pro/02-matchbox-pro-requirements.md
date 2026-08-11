# Matchbox Pro product requirements

This is a product contract, not a screen specification. The new frontend may
reorganize these capabilities around the final Pencil/Figma designs.

## 1. Product outcomes

Matchbox Pro should help a veMEZO voter answer five questions quickly:

1. Which incentive opportunities are best for my locks?
2. What voting incentives have I earned, and where did they come from?
3. What can I claim or act on now?
4. What is the best action before the epoch changes?
5. What changed since I last visited?

For an incentive provider:

1. What did I spend?
2. How many incremental votes/weight did I attract?
3. What did that weight do for my boost, share, or emissions?
4. What was my cost per result?
5. What should I fund next epoch?

## 2. Proposed product pillars

### Vote

One discovery and allocation workspace for opportunities available to the
wallet: veMEZO boost gauges, veBTC pool votes, veBTC validator votes, and future
Mezo Earn categories.

### Manage

Tools for gauge owners, validators, projects, and incentive providers to manage
profiles, campaigns, beneficiaries, and funding.

### Rewards and analytics

Historical voting-incentive earnings, gauge performance, incentive ROI, epoch
comparisons, protocol health, and a normalized activity explorer.

### Query

Universal Matchbox navigation, sourced Mezo support and wallet analysis, trusted
generative UI, and safe transaction preparation through the Stuart agent and the
shared Matchbox MCP.

### Build

A focused gauge-profile API/SDK, user-authorized Matchbox ID, and the Matchbox
MCP used by Stuart and external agents.

These are information-architecture concepts only; design may rename or regroup
them.

## 3. Functional requirements

### PRO-NAVIGATION — Sidebar and unified Vote tab

- Use a persistent website sidebar on desktop instead of the current top
  navigation. Mobile uses an appropriate compact equivalent.
- Provide one primary `Vote` destination rather than separate top-level
  veMEZO, pool, and validator voting pages.
- The Vote destination defaults to `veMEZO` because veMEZO voters are the
  primary persona.
- Use one simple asset-level switch:
  - `veMEZO` — vote on veBTC boost gauges;
  - `veBTC` — vote on pool or validator gauges.
- Inside `veBTC`, use lightweight category filters such as `All`, `Pools`, and
  `Validators`; do not create another level of site navigation.
- Keep a consistent opportunity card/table and persistent ballot summary while
  adapting category-specific metrics and contract rules.
- Never combine independent contract branches into a transaction that appears
  atomic. The UI may coordinate them but must label separate ballots and
  signatures.
- Suggested initial sidebar destinations are `Overview`, `Vote`, `Rewards`,
  `Gauges`, and `More`. Final names and grouping follow the Pencil/Figma work.

### PRO-QUERY — Universal search, Stuart, and canvas

- Provide a global `Search Matchbox or ask Stuart…` entry point through
  Command-K/Ctrl-K and an equivalent mobile control.
- Return deterministic navigation and local/indexed entity results without
  waiting for an LLM.
- Group useful results across destinations, entities, selected-wallet activity,
  answers, and supported actions without forcing the user to select a mode.
- Open substantive answers in a persistent side workspace that survives product
  navigation.
- Expand complex records, comparisons, charts, vote composition, and transaction
  review into a durable full Query canvas with the composer retained.
- Persist questions, actions, pinned live views, and explicitly shared results;
  do not turn navigation-only searches into history.
- Support authenticated Stuart memory with explicit confirmation, complete
  inspection/edit/delete controls, and no ability to authorize transactions or
  alter the canonical Optimizer.
- Show selected connected, watched, or inspected wallet context at all times.
- Compose only versioned trusted generative UI components. Do not execute
  arbitrary model-generated React, JavaScript, or HTML in Matchbox.
- Cite source, freshness, block/epoch, status, and calculation version for
  financial and time-sensitive support claims.
- Support user-reviewed escalation to an internal structured support queue.
- Provide selective read-only sharing with an explicit wallet/public-chain
  privacy warning, revocation, and optional expiry.
- Implement the detailed contract in
  `10-stuart-query-product-and-architecture.md`.

### PRO-WALLET — Wallet context and watch wallets

- Support a connected wallet and arbitrary read-only wallet lookup.
- Resolve every owned veBTC and veMEZO NFT for the selected network.
- Show position status, lock amount, current voting power, effective power,
  unlock time, permanent status, and expiry risk.
- Resolve each position's current votes, gauge, boost, claimable rewards, and
  next valid action.
- Aggregate across many NFTs without hiding per-NFT contract constraints.
- Offer a compact “Action center” sorted by urgency and expected value.
- Preserve deep links from an action to its exact position and workflow.
- Allow the active wallet to save other public addresses to a watch-wallet list.
- A watched wallet is read-only and clearly distinguished from the connected
  signing wallet.
- Launch watch wallets as an inspection feature only. Watched-wallet alerts and
  automation are follow-ons, not part of the first release.
- Do not aggregate multiple owned wallets into one account or portfolio.
- Defer general balances, cost basis, P&L, and non-incentive earnings to a later
  Matchbox Portfolio product.

### PRO-EARNINGS — Historical earnings ledger

Historical earnings are a first-class backend domain, not a derived frontend
widget.

Required earning categories:

- veMEZO bribes earned from boost-gauge voting;
- veMEZO bribes claimed;
- veBTC pool voter fees and bribes earned/claimed;
- validator-gauge incentives earned/claimed by veBTC voters.

Explicitly excluded from Matchbox Pro earnings:

- base veBTC yield and boost-attributed gauge-owner yield;
- validator beneficiary MEZO emissions;
- veMEZO rebases;
- LP fees/emissions as an LP;
- mUSD savings yield, merkle distributions, and Academy rewards;
- token price appreciation, cost basis, and P&L.

These may belong to the later Matchbox Portfolio product. They can remain in
activity or category-specific analytics without being counted as Pro earnings.

Each ledger entry must contain:

- network and chain ID;
- wallet and, when relevant, NFT token ID;
- source category and source contract;
- gauge/pool/validator identity;
- epoch ID and earning interval;
- earned, claimable, or claimed status;
- reward token, decimals, and raw integer amount;
- transaction hash/log index for realized events;
- historical USD price and value at earning/claim time;
- current USD value;
- price source and confidence;
- indexed block, block hash, timestamp, and finality status;
- calculation version and whether the amount is exact or estimated.

Required views:

- lifetime earned;
- earned in selected period;
- claimable now;
- claimed;
- pending/projected, visually separated from realized values;
- breakdown by token, strategy, gauge, pool, validator, NFT, and epoch;
- cumulative earnings chart;
- epoch-over-epoch change;
- downloadable CSV in v1; JSON remains available through the authenticated API
  or a follow-on export when demand justifies it;
- calculation-explanation drawer and source transaction links.

Rules:

- Never add projected rewards to realized lifetime earnings.
- Never silently turn an unpriced token into `$0`; show unpriced separately.
- Preserve native token amounts even when historical USD prices are missing.
- Backfills must be versioned and auditable.
- Reorgs must reverse affected derived entries deterministically.

### PRO-ACTIONS — Claims and transaction workspace

- Support Query preparation for votes, sends, loan repayments, reward claims,
  approved swaps, Mezo Earn deposits, and approved zaps in v1.
- Keep bridge execution outside v1 while making bridge activity searchable and
  explainable.
- Restrict swaps and zaps to Matchbox-approved routers, assets, vaults, and
  deterministic quote/simulation paths; do not expose arbitrary contract calls.
- Use exact-amount token approvals by default. Make route-aware slippage,
  price impact, fees, minimum output, expiry, and expected received assets
  visible before signing.
- Make `Claim all` the primary Rewards action, with every claimable
  voting-incentive source selected by default and per-source toggles available.
- Keep independent contract branches and required signatures visually
  separated even when the workspace presents one combined total.
- Group compatible calls into a simulated batch.
- Support EIP-5792 wallet batches, Safe transaction-builder export, and a clear
  sequential fallback.
- Display per-call and total expected gas when available.
- Offer optional claim-now-versus-wait guidance using estimated gas and
  claimable value, but never block a claim or mix this logic into the voting
  optimizer.
- Simulate calls before wallet confirmation and identify the exact failing call.
- Preserve partial-success status and support retrying only failures.
- Maintain client-side transaction state through refresh; optionally sync it to
  a signed-in profile.
- Explain irreversible token deposits and beneficiary changes in plain language.
- Never imply that two contract actions are atomic when the wallet executes them
  sequentially.

### PRO-OPPORTUNITIES — Discovery and comparison

- Normalize opportunity cards across boost gauges, pools, validators, and
  standalone voteables while retaining category-specific metrics.
- Search names, profiles, addresses, token IDs, operators, pool tokens, and tags.
- Filter by network, category, active state, watchlist, reward token, price
  confidence, position eligibility, under/over-subscription, and time remaining.
- Rank by projected personal incentive return in USD by default. Allow supporting
  sorts for incentives, vote weight, boost gap, historical consistency,
  liquidity, and risk without displacing the primary return objective.
- Require a configured, healthy price source before an incentive token can be
  approved for use on gauges.
- If that invariant is temporarily broken by a pricing outage, mark the affected
  opportunity degraded and withhold an authoritative optimizer result rather
  than silently using zero or a stale price beyond policy.
- Show current, next-epoch, and scheduled incentives distinctly.
- Provide transparent calculation details for every APY/APR.
- Show historical range and volatility, not only a point estimate.
- Surface unpriced incentives without ranking them as zero-value.
- Allow side-by-side comparison and a shareable comparison URL.

### PRO-OPTIMIZER — Ruthless return maximization

- Treat veMEZO boost voting, veBTC validator voting, and veBTC pool voting as
  separate contract branches with explicit independent eligibility.
- Present those branches through the single Vote destination described above.
- Preselect every eligible position for optimization, make that selection
  obvious, and allow positions to be deselected before calculating.
- Optimize all user-selected eligible NFTs as one combined USD-return problem,
  then emit the independent ballots and signatures required by each contract.
- The optimizer has one objective: maximize projected personal
  voting-incentive return in USD for the selected eligible positions, using each
  reward token's verified USD price at calculation time. Gas and transaction
  costs do not affect its allocation.
- Lead with `Projected this epoch: $X` for the active epoch. Show annualized APY
  only as secondary context and label it as an extrapolation, never as the
  optimizer's objective.
- Show the projected native-token breakdown next to or directly beneath the
  epoch USD total.
- Preserve every projected native token amount. Convert those amounts through a
  single internally consistent calculation-time price snapshot for comparison;
  do not discard the native-token result after USD normalization.
- Do not offer balanced, diversified, favorites, support-project, or other
  competing optimizer modes.
- Explain why the optimizer chose each target, the expected marginal return,
  native token amounts, calculation-time USD prices, pricing confidence, and
  dilution assumptions.
- Apply only hard protocol and execution constraints: eligibility, voting
  window, maximum targets, percentage totals, available power, required
  signatures, and transaction feasibility.
- Every approved incentive token must be priced. If pricing becomes unavailable,
  fail visibly and temporarily withhold the affected optimizer result; do not
  treat the token as zero-value.
- Users may manually edit the resulting ballot before signing, but that is an
  override of the recommendation rather than another optimizer mode.
- Use the current canonical vote snapshot as the authoritative optimization
  input. Do not hide a prediction of future votes inside the objective.
- Show historical dilution ranges and concentration risk as context around the
  current-snapshot result.
- Recompute projections as votes, incentive balances, or token prices move. Show
  the data and price timestamps/block, and make clear that a recommendation can
  change before the user signs.
- Recalculate against the latest canonical votes, incentives, and prices
  immediately before transaction preparation/signing. If the optimal allocation
  changed materially, show the previous and refreshed allocation plus projected
  USD delta and require explicit acknowledgement.
- Never silently overwrite manual ballot edits during the pre-sign refresh. The
  user may apply the refreshed optimum or keep their manual ballot after seeing
  the stale-recommendation warning.
- Treat a pre-sign change as material when any target allocation changes by at
  least one percentage point or projected epoch USD changes by at least 1%.
  Refresh smaller changes quietly without replacing manual edits.
- While Vote is open, refresh after relevant indexed vote/incentive events with
  a modest fallback poll; do not use an indiscriminate high-frequency timer.
- Version optimizer inputs and formulas so a historical recommendation can be
  reproduced.
- Store the exact price-selection IDs, native reward projections, USD values,
  vote snapshot, incentive balances, position power, and calculation version
  used for each recommendation.
- Validate exact contract rules: voting window, maximum targets, percentage
  total, already-voted state, stale votes, reset availability, and lock effects.

### PRO-GAUGES — Gauge and profile management

- Preserve current rich profile fields and avatar support.
- Create a stable profile identity that can follow an NFT/gauge transition
  without unsafe public-write tables.
- Provide autosave drafts and explicit publish state.
- Support reusable templates, cloning, and organization-managed brand profiles.
- Show exactly which wallet may edit and why.
- Allow the current authorized owner/operator/beneficiary to delegate off-chain
  profile editing to another wallet. The delegator chooses one gauge (the
  default) or all currently eligible gauges controlled by the signing wallet.
- Materialize wallet-wide delegation as explicit gauge grants at approval time;
  newly acquired gauges do not inherit access by default.
- Offer an explicit `Include future gauges` opt-in. When selected, newly eligible
  gauges controlled by that wallet inherit profile-edit access only for the
  remaining life of that delegation, and each inherited grant creates an audit
  event.
- Every delegation has an expiry, immediate revocation, and a signed audit
  trail. Offer 7-day, 30-day, and 90-day presets plus a custom expiry.
- Delegation never grants on-chain voting, funding, claiming, beneficiary, or
  asset-transfer authority.
- Detect NFT transfer, beneficiary change, gauge death, or mapping change and
  invalidate stale delegations promptly.
- Retain an audit trail of profile editors and material changes.
- Support verified links/claims in a future-safe way.
- Keep public profile reads highly cacheable.

### PRO-CAMPAIGNS — Incentive funding and ROI

- Represent a campaign as a persistent Matchbox object grouping intent, budget,
  epochs, deposits, and results while keeping deposits as independent on-chain
  transactions.
- Campaign inputs:
  - target gauge/pool/validator;
  - reward token and total budget;
  - one or more epochs;
  - desired vote weight/share/boost;
  - expected voter growth;
  - internal campaign name and notes.
- Preview approval, deposit, timing, and non-refundability.
- Estimate voter APR/APY after funding and dilution.
- Track:
  - funded token/USD amount;
  - votes before/after;
  - incremental weight;
  - boost/share/emission change;
  - cost per 1,000 vote weight;
  - cost per incremental boost point;
  - estimated incremental yield/emissions;
  - realized ROI where defensible.
- Allow campaign comparison across epochs and targets.
- Lead campaign results with cost per incremental vote weight, followed by
  boost/share/emission change and estimated return.
- Never claim causal ROI when only correlation is observable; label estimates.
- Recurring campaign scheduling creates reminders only. Automated funding is a
  separate future smart-account/security project.
- Campaign and organization tooling follows the stable voter marketplace and
  historical incentive ledger rather than blocking the initial Pro launch.

### PRO-ORGANIZATIONS — Team-managed off-chain resources

- Organizations manage gauge/validator/project profiles, campaigns, developer
  apps, team membership, and audit history.
- Start with owner, admin, editor, and viewer roles with resource-scoped
  permissions.
- An organization role never grants on-chain authority. A currently authorized
  wallet remains the signer for funding, voting, claiming, beneficiary, and
  ownership actions.
- Organization and campaign features ship after the stable voter core rather
  than blocking the first Pro release.

### PRO-POOLS — Pool intelligence

- Preserve pool search, type/gauge filters, LP metrics, voter metrics, reserves,
  current/next incentives, and incentive funding.
- Keep LP APR separate from voter APR.
- Add historical TVL, volume, fees, emissions, voter incentives, voter weight,
  and APR.
- Show data freshness and upstream source health.
- Execute pool voting inside the unified Vote workspace when current contracts
  can be simulated and reconciled safely. Strict self-contained parity is a
  public-release gate: if any retained branch is unsafe or unproven, Pro remains
  in closed testing until that branch is native and reconciled.

### PRO-VALIDATORS — Validator intelligence

- Preserve registry/profile composition, voting, funding, rewards, claims,
  distribution history, and beneficiary handoff.
- Add historical vote share, rank, incentives, distributions, APY, and campaign
  ROI.
- Show voter concentration and large epoch-over-epoch movements.
- Warn validators when a large voter has decayed/stale weight or leaves.
- Provide a direct, shareable campaign/gauge page.
- Preserve the rule that only the current beneficiary can switch beneficiary.
- Provide a recovery guide for rewards stranded on the previous beneficiary,
  even if the normal UI cannot claim them.

### PRO-ACTIVITY — Explorer and audit trail

- Preserve the normalized activity types and user/system separation.
- Add first-class wallet, NFT, epoch, gauge, pool, validator, token, and
  transaction filters.
- Give every normalized event a stable permalink.
- Show source/finality/indexing status and raw-event references.
- Export the entire filtered set asynchronously for large ranges.
- Feed relevant activity into voting-incentive timelines and notifications
  rather than isolating it on one explorer page.
- In Pro, show activity contextually on wallet, Rewards, gauge, pool, validator,
  and transaction surfaces, with a normalized expert explorer under `More`.
- In the next phase, link records to Matchscan, the separate fully fledged
  Mezo-tailored explorer. Matchscan is not a Matchbox Pro launch dependency.

### PRO-ALERTS — Notifications and recurring workflow

- Ship voting-window closing, eligible-position-not-voted, configurable
  claimable-value, configurable lock-expiry, and transaction-result alerts in
  v1.
- Gauge becomes over/under subscribed.
- Watched gauge changes incentives, status, APY, or profile.
- Validator vote share or beneficiary changes.
- Campaign funding is due or an epoch had no planned funding.
- Transaction confirmed, partially failed, or replaced.
- Ship in-app and email delivery in v1. Telegram, browser push, and general
  Discord delivery are follow-ons.
- Every alert must be idempotent, user-configurable, and deep-link to the action.
- Offer sensible claim/expiry threshold presets plus custom values and send at
  most one notification per condition per epoch.

### PRO-OVERVIEW — Epoch dashboard and action checklist

- Use a dashboard/checklist hybrid, not a step-by-step wizard.
- Make the upper, dominant portion of Overview action-first—roughly the first
  two-thirds of the initial desktop experience—rather than splitting actions
  and analytics equally.
- Lead with a compact current-epoch summary and the few actions that matter now.
- Checklist items include unvoted eligible locks, claimable incentives, changed
  watched opportunities, and voting-window timing.
- Place market and performance analytics below or beside the checklist so they
  provide context without blocking action.
- Allow checklist items to be dismissed only when dismissal is safe; contract-
  derived incomplete actions return in the next relevant epoch.
- Every item deep-links into the prefiltered Vote, Rewards, or Manage workflow.

### RETIRED-ACADEMY — Not part of Matchbox Pro

- Academy does not ship in Matchbox Pro and must not delay the incentive
  marketplace.
- Do not port the Academy simulator, standings, Discord-role reconciliation, or
  generalized program engine into the Pro codebase.
- Preserve any required historical/archive access outside Pro until its separate
  retirement obligations are resolved.

### PRO-MATCHBOX-ID — General wallet identity and consent

- Wallet connection alone must remain sufficient for public/on-chain features.
- The connected wallet is the sole account identity; do not aggregate multiple
  controlled wallets into one Matchbox account.
- Restore Matchbox ID as a named, first-class identity product that lets users
  sign in to compatible apps with their wallet and explicitly consent to scoped
  identity claims.
- Issue a stable pairwise app subject rather than making the wallet address the
  only cross-application identifier. Expose the wallet address only when the app
  requests and the user approves its scope.
- A wallet account may sync watch wallets, alert preferences, profile drafts,
  delegations, and transaction history across devices.
- Discord becomes one linked provider, not the canonical identity record.
- Users can see, export, and revoke linked providers and connected apps.
- Third-party apps may request consent to resolve the authorizing wallet's
  Discord ID, username, display name, and avatar. They must not enumerate
  wallet-to-Discord links.
- Use standards-based OAuth authorization code + PKCE and OpenID Connect for
  general sign-in, discovery, ID tokens, pairwise subjects, userinfo, grant
  management, and revocation rather than porting the current custom exchange.

### PRO-NETWORK — Network and data reliability

- Mainnet/testnet are explicit in every URL/API/cache key.
- Mainnet is the default and only network shown in ordinary product navigation.
  Testnet is available through an explicit developer-mode setting.
- Show per-source freshness and degraded state.
- Automatically fail over read RPCs on backend services.
- Preserve expert custom-RPC support without allowing it to corrupt shared
  backend data.
- Pin related calculations to a consistent block/epoch snapshot.
- Make “live,” “finalized,” “estimated,” and “historical snapshot” visible.

## 4. Advanced feature candidates

### Recommended early differentiators

1. Historical voting-incentive earnings with exact source attribution.
2. Unified action center and safe multi-source claiming.
3. Epoch planner with missed-action alerts.
4. Explainable optimizer that ruthlessly maximizes projected personal incentive
   return without considering gas.
5. Incentive campaign ROI and historical benchmark comparisons.
6. Read-only wallet URLs and saved watch wallets.
7. Query with sourced natural-language analytics, support, trusted generative
   UI, memory, and safe action preparation.
8. Stateless Matchbox MCP primitives plus optional `ask_stuart` synthesis.

### Valuable follow-ons

- Later Matchbox Portfolio for general balances and non-voting returns.
- Public incentive-earnings/gauge reports with privacy controls.
- Optimizer backtesting over prior epochs.
- Whale/concentration and vote-migration analytics.
- Protocol-wide epoch report and weekly email digest.
- Embeddable gauge/pool/validator widgets.
- Partner webhooks and event streams.
- Mobile/PWA action center.

### High-risk ideas that require explicit approval

- Fully automated recurring votes or incentive deposits.
- Transaction relaying or gas sponsorship.
- Custodial portfolio aggregation.
- Social ranking tied to wallet identity.
- Arbitrary trading, unapproved routers/assets, or unsimulated swap execution.
- Monetized optimizer placement or sponsored ranking.

## 5. Product quality requirements

- A new participant can understand their next action without knowing contract
  names.
- An expert can inspect exact contract, block, epoch, raw amount, and formula.
- Pages render useful public data before wallet connection.
- Personalized routes avoid client-side RPC waterfalls.
- Loading and degraded states identify which source is slow or unavailable.
- All important tables work on mobile through an intentional compact design.
- Keyboard, screen-reader, contrast, reduced-motion, and touch behavior meet
  WCAG 2.2 AA.
- Every write flow has simulation, pending, confirmed, failed, replaced, and
  partial-success states.
- User-facing timestamps include UTC and optionally local time.
- Terminology is consistent and backed by an in-product glossary.

## 6. Accepted phased scope

### Phase 0 — Data foundation

- Canonical chain event ledger and read models.
- Epoch, price, wallet, profile/delegation, and voting-incentive earnings
  domains.
- Query/MCP schemas, knowledge-source authority, generative UI manifests,
  thread/memory/support-report models, and transaction proposal handles.
- Internal APIs used by the old product for parity checks.
- Reconciliation against the current UI, subgraph, and contract reads.

### Phase 1 — Complete voter core

- New voter dashboard/action checklist.
- Historical voting-incentive earnings.
- Unified opportunity discovery and one Vote workspace across veMEZO boost,
  veBTC pool, and veBTC validator branches.
- Ruthless current-snapshot optimizer, manual ballot editing, material-change
  refresh before signing, voting, claims, and CSV export.
- Gauge, pool, and validator intelligence.
- Gauge profile management and delegated editing.
- Read-only watch-wallet inspection, without watch-wallet alerts.
- In-app and email voter alerts for the signing wallet.
- Read-only public detail pages.
- Query overlay, Stuart workspace, canvas, history, pinned live views, selective
  sharing, support escalation, and connected/watched/inspecting wallet scope.
- Query-prepared sends, repayments, approved swaps, Earn deposits, and zaps with
  explicit wallet signature; bridge execution remains deferred.
- Matchbox MCP as the first-party Stuart capability boundary, external developer
  preview during closed alpha, and stable public MCP at the self-contained Pro
  launch.

### Phase 2 — Provider and organization tools

- Incentive campaigns, budgets, and campaign ROI analytics.
- Organizations, roles, and audit trails.
- Validator/pool provider workflows and provider alerts.
- Watch-wallet alerts, JSON export UI, and carefully scoped automation.

### Phase 3 — Developer platform

- Focused gauge-profile API, SDK, and developer console.
- Matchbox ID as a standards-based general wallet identity/sign-in product,
  including explicitly consented Discord ID, username, display name, and
  avatar claims.
- Broader developer-console polish and SDK ergonomics for the already-live
  Matchbox MCP; do not defer the MCP foundation or stable Pro-launch endpoint to
  this phase.

Broader Portfolio capabilities remain a later product phase. Matchscan is a
separate next-phase product, not a Matchbox Pro launch phase.
