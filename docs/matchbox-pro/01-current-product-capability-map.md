# Current Matchbox capability map

This is the functional baseline. “Preserve” means preserve the user outcome, not
the current route, component, database, or service.

## 1. Product surfaces and audiences

| Surface                  | Current audience                       | Current purpose                                                        |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------------------- |
| Marketing home and docs  | New participants                       | Explain veBTC, veMEZO, gauges, epochs, voting, incentives, and claims  |
| Matchbox app             | veMEZO and veBTC holders               | Portfolio, voting, boost management, incentives, analytics             |
| Pool explorer            | LPs, veBTC voters, incentive providers | Compare pools, voter economics, and fund incentives                    |
| Validator voting         | veBTC holders and validators           | Allocate veBTC across validators and compete for validator votes       |
| Activity explorer        | Analysts and participants              | Explore normalized user and protocol activity                          |
| Mezo Academy             | Program participants and operators     | Leaderboard, eligibility, simulated rewards, Discord role linking      |
| Matchbox ID              | Wallet holders                         | Authorize connected applications to read linked identity data          |
| Developer portal/API/SDK | Integration developers                 | Register apps, manage keys, read gauges, and access consented profiles |

## 2. Personas and permissions

### Visitor

- Browse public gauges, pools, validators, profiles, incentives, APYs, and
  activity without connecting a wallet.
- Toggle mainnet/testnet, light/dark theme, and inspect documentation.
- Open direct, shareable detail URLs.

### Connected wallet

- View native BTC, MEZO, veBTC, and veMEZO state.
- Switch network and choose a preferred or custom Mezo mainnet RPC.
- Copy receive addresses and QR codes.
- Send native BTC or ERC-20 assets.
- Disconnect.
- Bitcoin-family wallets may require a one-time smart-wallet setup before use.

### veMEZO holder

- View all owned veMEZO NFT locks and voting power.
- Select one or many eligible locks.
- Allocate each selected lock across boost gauges.
- Use a reward optimizer to generate an allocation from priced incentives.
- Submit wallet batches when supported, sequential transactions otherwise, or
  export a Safe batch.
- Unpair/reset selected locks.
- View current allocations, projected APY/rewards, and claimable bribes.
- Claim one lock, claim many locks, retry partial failures, or export a Safe
  claim batch.

### veBTC holder

- View all owned veBTC locks, effective voting power, boost, and gauge mapping.
- Create a boost gauge for a lock if one does not exist.
- Poke/refresh boost when the contract permits.
- Manage a rich gauge profile.
- Save and reuse profile templates.
- Transfer profile metadata between eligible owned gauges, limited per source
  gauge and epoch.
- Deposit non-refundable allowlisted incentive tokens.
- Vote in the pools branch and validator branch independently where contracts
  permit.

### Validator operator or rewards beneficiary

- View and edit validator profile when operator or beneficiary.
- Deposit validator incentives.
- Inspect vote weight, share, projected APY, contracts, registry metadata,
  current/next incentives, and distribution history.
- Current beneficiary can claim unclaimed MEZO.
- Current beneficiary can irreversibly hand beneficiary rights to another
  address. The operator cannot override that handoff.

### Developer organization member

- Sign in with Google or email magic link.
- Bootstrap an organization and developer account.
- Register apps and request scopes.
- Create/revoke publishable and secret API keys for approved apps.
- Inspect coarse request usage.

### Connected-app user

- Use SIWE/Web3 authentication in Matchbox ID.
- Review app identity, requested scopes, and consent.
- Approve a short-lived authorization code redirect.
- View and revoke connected apps.

## 3. Global app shell

Current navigation:

- Dashboard
- veMEZO
- veBTC
- Academy
- Pools
- How-to
- Activity
- Documentation

Global behavior:

- Desktop and mobile navigation.
- Network selector for Mezo mainnet/testnet.
- Wallet connection via injected wallets, WalletConnect/Safe, and Mezo Passport
  wallet support.
- Light/dark/system theme.
- Header ticker with protocol totals and BTC/MEZO pricing.
- RPC health awareness and user-selected mainnet RPC fallback.
- Responsive cards and tables.
- Local watchlist for gauges.
- Hidden preview/simulation mode for development demonstrations.
- Umami analytics on the existing frontend.

## 4. Route-by-route behavior

### `/` — marketing home

- Position Matchbox as Mezo's liquidity layer.
- Route users to analytics/dashboard, veMEZO voting, and veBTC management.
- Change primary action based on wallet connection.

### `/dashboard` — connected portfolio

- Require a wallet for personalized data.
- Show aggregate claimable bribes by token and USD.
- Show current projected voting APY.
- Claim all, refresh claimable state, copy/export Safe JSON, and retry failed
  per-lock claims.
- Show counts and total voting power for veMEZO and veBTC locks.
- Show veMEZO lock cards with amount, power, timing/status, allocation detail,
  claimable value, and ability to continue voting.
- Show veBTC lock cards with amount, power, timing/status, gauge, boost, APY,
  and poke action.
- Open the profile-transfer flow.
- Browse all gauges with search, status/watchlist/needs-boost filters, sorting,
  pagination, and detail links.

Important gap: the dashboard has current claimable and projected rewards, but no
canonical historical wallet earnings or P&L ledger.

### `/boost` — veMEZO boost voting

- Explain voting-window and eligibility state.
- Select multiple veMEZO locks; distinguish eligible, already-voted, expired,
  and otherwise unavailable locks.
- Display aggregate selected power, existing allocations, projected rewards,
  and claimable value.
- Browse boost gauges with:
  - name/profile/avatar and veBTC token ID;
  - active status and watch state;
  - veBTC weight and veMEZO weight;
  - boost multiplier and optimal/additional veMEZO;
  - incentive USD value and token breakdown;
  - projected APY.
- Search, filter active/inactive/watching, filter needs-boost, sort, and paginate.
- Add/remove gauges from an allocation cart.
- Enter percentage allocations with a total no greater than 100%.
- Optimize allocations using marginal incentive return and reliable token prices.
- Review cart validation and transaction progress.
- Submit a multi-lock vote using EIP-5792 wallet batches when available,
  sequential fallback otherwise, or Safe batch export/copy.
- Unpair/reset selected locks with the same batching choices.
- Open a boost calculator and an embedded usage guide.

### `/gauges` and `/gauges/:address` — boost-gauge explorer

List:

- Protocol totals, number of gauges, active/inactive/watching filters, and
  needs-boost filter.
- Sort by veBTC weight, veMEZO weight, boost, optimal veMEZO, incentives, APY.
- Card view on small screens and table view on larger screens.

Detail:

- Resolve gauge, veBTC NFT, live owner/beneficiary, and stored profile.
- Display rich profile: avatar, display name, description, website, social
  links, tags, incentive strategy, and voting goals.
- Display veBTC/veMEZO weight, current boost, optimal veMEZO, subscription
  status, beneficiary, current incentives, and APY.
- Permit incentive funding from the public detail page.
- Display per-epoch historical performance:
  - veMEZO votes;
  - optimal subscription, over/under status, and dilution;
  - boost multiplier;
  - incentive USD total and token breakdown;
  - BTC/MEZO price snapshot and whether pricing is approximate;
  - APY and APY at optimal subscription.
- Show a “coming soon” state when history has not been recorded.

### `/incentives?view=manage` — veBTC/gauge management

- Select an owned veBTC lock/gauge.
- Create its boost gauge if missing.
- Detect NFT ownership changes and disable unsafe profile edits.
- Profile tabs:
  - Profile & Links
  - Incentives
  - Analytics
- Edit avatar, name, description, site, Twitter/X, Discord, Telegram, GitHub,
  incentive strategy, voting strategy, and tags.
- Upload avatar through an ownership-authorized signed flow.
- Apply an existing saved profile template.
- Save the current profile as a named template.
- Reset or delete profile data where allowed.
- Show current incentive tokens and USD value.
- Select an allowlisted token, inspect balance/allowance, approve if needed, and
  deposit incentives after an irreversible-action warning.
- Show gauge APY, boost, weight, and analytics summary.

### `/incentives?view=vote` and `/validator-gauges/:address`

Validator voting:

- Use owned veBTC NFTs as the voting assets.
- Allow multi-lock selection and exclude locks that already voted in the current
  validator-voter epoch.
- Search validator moniker, profile, details, operator, and gauge address.
- Sort by incentives, APY, vote share, BTC weight, or name.
- View cards with validator identity, gauge, weight, share, incentives, and APY.
- Allocate exactly 100% across no more than the contract maximum.
- Optimize an allocation based on marginal priced incentive returns.
- Vote sequentially, in a supported wallet batch, or via Safe export.
- Communicate first/last-hour voting restrictions and the one-vote-per-epoch
  finality of validator ballots.

Validator detail:

- Combine PoA registry metadata with editable Matchbox profile metadata.
- Show live/inactive state, weight, share, APY, current and next incentives.
- Show gauge/bribe/operator/beneficiary addresses.
- Allow profile editing by operator or current beneficiary.
- Allow anyone to add incentives.
- Show and claim beneficiary MEZO rewards.
- Paginate indexed distribution events with explorer links.
- Permit a beneficiary handoff with strong warnings about stranded past rewards
  and lack of operator recovery.

### `/pools`, `/pools/:address`, and `/voteables/:address`

- Fetch known Mezo pools for the selected network.
- Search and filter by pool type: volatile, stable, concentrated.
- Filter to gauged pools.
- Sort by LP APR, voter APR, TVL, fees APR, emissions APY, 24h volume, or
  incentives.
- Distinguish LP-side return (fees plus emissions) from voter-side rewards
  (redirected fees plus bribes).
- Display pool assets, reserves, TVL, volume, fees, gauge state, current and
  next-epoch incentives.
- Display non-pool standalone voting targets from the Mezo votables API.
- Fund pool or standalone-gauge incentives.
- In the pool funding flow, preview voter APR under adjustable assumed vote
  growth, estimate cost per 1,000 votes, and show token allowance/balance.

Current limitation: Matchbox surfaces pool voting opportunities and funding, but
the primary in-app veBTC voting workflow is validator-focused. The Pro product
must decide whether pools and validators share one ballot workspace.

### `/activity` — activity explorer

- Query the Matchbox Goldsky subgraph, with API/RPC normalization fallbacks.
- Separate participant activity from system activity.
- User filters:
  - locks;
  - Matchbox boost;
  - Mezo veBTC pairing boost;
  - extensions;
  - incentives and rewards.
- System filters:
  - automated pokes;
  - reward distributions;
  - gauge lifecycle;
  - incentives;
  - splitter periods;
  - emissions;
  - rebase checkpoints;
  - PCV distributions/debt payments;
  - mUSD savings yield.
- Filter by date range, action type, actor, gauge, contract, and order through
  the API.
- Group multi-event transactions and automated batch pokes.
- Enrich gauges/pools with profiles and human names.
- Expand normalized event detail and link transactions to the explorer.
- Paginate 50 rows, jump to a page, and export the selected range as CSV.
- Show incentive-history analytics by epoch/category with detail expansion.

Indexed event families include lock creation/increase/extension/withdrawal,
permanent lock changes, transfers/merges, boost votes/abstains/pokes, pairing,
gauge lifecycle, incentives, rewards, validator lifecycle, splitter periods,
emissions, rebases, merkle claims, mUSD savings, and PCV events.

### `/academy`, `/academy-sim`, and `/link`

Public Academy:

- Resolve configured Academy semesters/seasons and fall back gracefully.
- Show a “Class of 2026” leaderboard across configured windows.
- Show rank, points/rewards, participation, and perfect-participation badges.
- Search a wallet and open a public actor profile with activity detail.
- Show the connected wallet's standing.
- Generate a shareable Academy image, download it, or use native sharing.
- Link/unlink a one-to-one Discord identity and reconcile Academy roles.

Simulator/operator view:

- Fetch historical lock, vote, and extension activity.
- Reconstruct per-actor, per-epoch state.
- Adjust time range and reward-distribution parameters.
- Apply exclusions/blacklists and an optional reward floor/cull.
- Show participants, median APR, full participation, event totals, epochs,
  culled rewards, charts, leaderboards, and detailed actor profiles.

Discord link:

- Begin from a short-lived unguessable link created by the Discord bot.
- Show Discord account and requested permissions.
- Connect a wallet, sign a nonce-bound message, verify it, enforce one wallet
  per Discord account and one Discord account per wallet, store the link, and
  reconcile managed roles.
- Permit wallet-signed unlinking.

### `/how-to` and hosted docs

- Explain gauges, voting power, epochs, boost, voter flow, gauge-owner flow,
  claims, and FAQs.
- Link to deeper guides for voting and gauge management.

## 5. Current backend and data capabilities

### On-chain reads and writes

- viem/wagmi reads Mezo contracts directly from the browser and server routes.
- Contract coverage includes veBTC, veMEZO, BoostVoter, PoolsVoter,
  ValidatorsVoter, gauges, bribes, ERC-20s, and gauge factory behavior.
- Writes cover gauge creation, voting, reset/unpair, poke, token approval,
  incentive deposits, bribe claims, validator reward claims, beneficiary switch,
  and asset sends.

### Supabase

- PostgreSQL:
  - gauge profiles and saved templates;
  - profile transfer/reset audit;
  - per-epoch gauge history and price/incentive snapshots;
  - validator profiles;
  - Discord wallet links, sessions, and Academy semester configuration;
  - developer accounts, organizations, apps, keys, grants, codes, usage, audit;
  - single-use profile write nonces.
- Storage: public gauge/validator avatars with signed authorized mutation flows.
- Auth: developer email/Google and wallet Web3/SIWE.
- Deno Edge Functions:
  - gauge ownership verification/profile mutation/transfer;
  - validator profile mutation;
  - gauge-history recording and historical price backfill;
  - Discord bot, link, and role reconciliation.

### Indexing and external sources

- Goldsky/The Graph subgraph for normalized Matchbox and Mezo activity.
- Mezo public APIs for pools and votables.
- Mezo RPC endpoints for contract state and logs.
- GeckoTerminal and Base RPC-derived pricing, plus stable/BTC token inference.
- BTC oracle reads.
- Supabase gauge history for boost-gauge epoch snapshots.

### Developer platform

Current API:

- `GET /v1/gauges/:gaugeAddress`
- `GET /v1/vebtc/:tokenId/gauge`
- `GET /v1/profiles/by-wallet/:walletAddress`
- `POST /v1/authorizations/exchange`
- `GET /health`
- `GET /openapi.json`

Current controls:

- app review status and approved scopes;
- publishable and secret HMAC-hashed keys;
- origin allowlists for publishable keys;
- optional CIDR restrictions for secret keys;
- per-minute Durable Object quotas and per-day database usage;
- ETags and short public caching;
- request IDs and audit rows;
- one-time short-lived authorization codes and revocable grants;
- TypeScript SDK with runtime response validation.

## 6. Known gaps and inconsistencies

1. No canonical wallet earnings ledger or historical earnings dashboard.
2. Portfolio value, lifetime earned, cost basis, realized claims, and historical
   APY described in older docs are not consistently implemented.
3. Business calculations are split among large React pages, hooks, server
   routes, Deno functions, and the subgraph.
4. Many screens create RPC waterfalls and repeat the same topology/price reads.
5. Gauge history is a scheduled snapshot and can be absent or use approximate
   prices; it is not a complete event-derived ledger.
6. Watchlists, theme, and RPC preferences are browser-local and do not follow a
   user across devices.
7. Identity is effectively a Discord link rather than a general Matchbox
   profile/claims model.
8. The developer API is a small beta surface with only two scopes and a custom
   consent protocol.
9. Developer console app creation, review, keys, and usage are concentrated in
   one old page with limited team/operations support.
10. The frontend mixes Tailwind, Mezo Clay/BaseUI, Styletron, and several
    generations of visual patterns.
11. Next.js Pages Router and App Router route handlers coexist.
12. Runtime responsibilities span browser RPC, Next routes, Cloudflare Worker,
    Supabase Deno functions, PostgreSQL scheduling, and Goldsky.
13. Mainnet and testnet support is inconsistent across developer and historical
    APIs.
14. Some public Mezo API calls require proxying and spoofed origins, creating a
    fragile dependency.
15. Current token pricing is not a complete historical oracle system.
16. Product terminology changes by page: boost, vote, pair, gauge, incentive,
    bribe, reward, and earnings need one controlled vocabulary.
