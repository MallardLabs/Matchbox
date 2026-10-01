# Open product decisions

These questions are ordered to prevent premature layout or architecture choices.
The “working default” lets an agent continue drafting, but it is not a final
answer.

## Decisions accepted 2026-07-31

| Decision             | Accepted direction                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Product              | Focused incentive marketplace; analytics supports the marketplace; broader Matchbox Portfolio later |
| Primary persona      | veMEZO voters                                                                                       |
| Secondary persona    | Mixed veMEZO/veBTC power users                                                                      |
| Historical earnings  | Voting incentives only                                                                              |
| Public wallet lookup | Yes; saved watch wallets launch as inspection-only                                                  |
| Account model        | One signing wallet; no multi-wallet aggregation                                                     |
| Delegation           | Snapshot by default; optional explicit future-gauge inheritance; expiry and revocation required     |
| Navigation           | Website sidebar instead of top navigation                                                           |
| Voting IA            | One Vote destination; simple veMEZO/veBTC switch and category filters                               |
| Epoch home           | Action-first dashboard/checklist; actions dominate roughly the first two-thirds                     |
| Optimizer            | Maximize projected USD incentive return; lead with active-epoch USD, APY secondary                  |
| Pre-sign refresh     | Recalculate before signing; show changed optimum and require acknowledgement                        |
| Saved strategies     | Do not include                                                                                      |
| Rewards              | One claimable-incentives workspace with separate contract branches and signatures                   |
| Claim default        | `Claim all` primary; all sources selected with per-source toggles and simulation                    |
| History exports      | CSV in v1; JSON through authenticated API or follow-on export                                       |
| V1 alerts            | In-app/email for voting, claim, expiry, and transaction conditions                                  |
| Campaigns            | Persistent objects and reminder-only recurrence; ship after voter core                              |
| Organizations        | Manage off-chain team resources; wallets remain transaction signers                                 |
| Pool voting          | Execute natively in unified Vote; safe reconciliation is required before any public release         |
| Academy              | Retired from Matchbox Pro                                                                           |
| Paid features        | None; no billing, entitlement, upgrade, or paywall architecture                                     |
| Incentive pricing    | Every approved token is priced; optimizer uses verified USD price at calculation time               |
| Developer profiles   | One schema for boost, validator, pool, and standalone profile-backed types                          |
| Developer identity   | Consented Discord ID, username, display name, and avatar for the authorizing wallet                 |
| Matchbox ID          | Restore as general wallet identity/sign-in with standards-based scoped consent                      |
| Developer access     | Free registered REST API; a bounded anonymous public MCP subset is the explicit Query-era exception |
| API protection       | Key/app limits first, IP/session as secondary signals; product BFF separated from developer API     |
| Discord app review   | Manual approval during beta                                                                         |
| Developer console    | Distinct from the ordinary Matchbox Pro application                                                 |
| Developer operations | Browser/server keys, automated profile-app checks, beta limits, passkey + email console auth        |
| Network UX           | Mainnet by default; testnet only through explicit developer mode                                    |
| Brand direction      | Quiet marketplace + slight protocol-terminal character; design details delegated                    |
| Brand assets         | Keep current name/logo; no flame; subtle ambient orange glow allowed                                |
| Theme                | Purpose-built dark and light; dark-mode first                                                       |
| Repository           | Greenfield Pro workspaces inside current monorepo                                                   |
| Launch scope         | Complete voter core (Option B); timing intentionally unset and milestone-driven                     |
| Launch parity        | Strict self-contained parity before any public release; no legacy handoffs                          |
| Activity             | Contextual + expert tool under `More`; Matchscan is next-phase full Mezo explorer                   |
| Engineering ADRs     | Q34–Q40 delegated to implementation agent using the accepted evidence/benchmark criteria            |

## Decisions accepted 2026-08-11 — Stuart Query

| Decision            | Accepted direction                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product and agent   | `Query` is the universal Matchbox search/intelligence/action product; `Stuart` is its friendly but restrained agent                                         |
| Entry and workspace | Command-K/Ctrl-K opens search; substantive answers persist in a side workspace; rich analysis and actions expand into a durable canvas                      |
| History             | Questions, actions, pinned live views, and explicitly shared results persist; navigation-only searches do not                                               |
| Wallet scope        | One connected, watched, or inspected public address at a time; watched/inspected addresses remain read-only                                                 |
| Cross-chain scope   | Follow only bridge activity that explicitly links source and destination transactions; do not automatically scan the same address across chains             |
| Memory              | Authenticated, transparent, editable, and explicitly confirmed; never authorizes actions or changes the canonical Optimizer                                 |
| Gauge clarification | `Best return for me`, `Most incentives deposited`, and `Most consistently funded`; only the first invokes the Optimizer                                     |
| Consistency         | Deterministic versioned history metric, defaulting to eight completed epochs with 4/8/12 controls                                                           |
| Mezo support        | Chain state, Matchbox calculations, official docs, governance, audits, announcements, and structured status with visible sources                            |
| Support escalation  | User-reviewed report to an internal structured queue; only selected conversation and diagnostics are submitted                                              |
| Sharing             | Read-only thread/view links with an explicit wallet/public-chain privacy warning, selective content, revocation, and optional expiry                        |
| Generative UI       | Stuart composes trusted native components and MCP Apps; no arbitrary model-generated code executes in Matchbox                                              |
| Canvas              | Complex records, comparisons, charts, votes, and transaction reviews may occupy a full persistent content canvas with the composer retained                 |
| V1 actions          | Votes, sends, repayments, claims, approved swaps, Earn deposits, and zaps; bridge execution deferred                                                        |
| Swap/zap safety     | Matchbox-approved routers, assets, vaults, deterministic quotes, simulations, price-impact/slippage/minimum-output protection, and wallet signature         |
| Optimizer           | Preserve one ruthless personal projected-USD-return objective; research rankings and manual edits are not alternative optimizer modes                       |
| MCP role            | Stateless MCP 2026-07-28 is foundational; it exposes deterministic tools to Stuart and external agents plus optional `ask_stuart` synthesis                 |
| MCP access          | Tightly limited anonymous public subset, free registered higher-volume access, OAuth for memory/account continuity, and unsigned transaction proposals only |
| Public MCP timing   | Developer preview during closed Pro alpha and stable public MCP at the self-contained Pro launch                                                            |
| Runtime             | Groq `openai/gpt-oss-120b` initially; Matchbox controls the agent/tool loop and degrades to deterministic capabilities during a Groq outage                 |
| Visual reference    | Owner approved free reuse of selected Beautiful UI component examples, refactored into the Matchbox design system                                           |
| Automations         | Proposal contracts are automation-ready, but recurring delegated execution requires a separate post-V1 security specification                               |

## Round 1 — Product direction

### Q1. What is Matchbox Pro primarily?

Accepted: a focused incentive marketplace. Analytics is useful when it improves
marketplace decisions. A broader Matchbox Portfolio can be implemented later.

Alternatives:

- a focused gauge/incentive marketplace;
- an expert analytics terminal;
- the general portfolio home for Mezo;
- infrastructure/API first, with the consumer app as a showcase.

Why it matters: this determines the home screen, navigation, backend breadth,
and what “historical earnings” includes.

### Q2. Who is the first user Matchbox Pro must delight?

Accepted: veMEZO voters first; mixed veMEZO/veBTC power users second.

Possible priorities:

- new veMEZO voter;
- sophisticated multi-NFT voter;
- veBTC gauge owner;
- validator operator;
- pool/project incentive manager;
- protocol analyst;
- integration developer.

Why it matters: one product can serve all of them, but one persona must define
the default experience.

### Q3. How broad should “earnings” be?

Accepted: Matchbox Pro historical earnings includes voting incentives only.
Other categories belong to a possible later Matchbox Portfolio.

Choose which belong:

- boost-gauge bribes;
- pool voter fees/bribes;
- validator distributions;
- veBTC base yield;
- yield uplift from boost;
- veMEZO rebase;
- LP fees/emissions;
- mUSD savings yield;
- merkle rewards;
- Academy rewards;
- wallet token price appreciation/P&L.

Why it matters: exact historical earnings can be a bounded ledger or a much
larger tax/portfolio system.

### Q4. Should users be able to paste any wallet and see its voting context and incentives?

Accepted: yes. Users can also save public addresses as read-only watch wallets.
The launch version is for inspection only; watched-wallet alerts come later.

Why it matters: read-only wallet pages are excellent for support, research, and
sharing, but some users may perceive aggregation as a privacy concern.

### Q5. Should one account link multiple wallets?

Accepted: no. One wallet is the account/signing identity. A separate delegation
system may grant another wallet off-chain gauge-profile editing rights without
granting asset or contract authority.

Delegation defaults to one gauge or a snapshot of all currently eligible gauges
on the wallet. The delegator may explicitly opt into future-gauge inheritance;
the opt-in is visible, expires with the delegation, is immediately revocable,
and audits every inherited gauge grant.

Why it matters: sophisticated users, teams, and migrated wallets otherwise get a
fragmented earnings history.

### Q6. Should the product remain mainnet/testnet, or become mainnet-first?

Accepted: mainnet is the default product; testnet is available only through an
explicit developer mode that never pollutes normal navigation or analytics.

Why it matters: current network switching adds complexity to every cache, query,
and screen.

## Round 2 — Workflow and automation

### Q7. Should boost, pool, and validator voting share one `Vote` workspace?

Accepted: one `Vote` destination. Use a simple veMEZO/veBTC switch, with compact
pool/validator filters inside veBTC, while keeping independent ballots explicit.
Primary website navigation lives in a sidebar.

Why it matters: the current split teaches contract topology rather than user
intent, but a unified page can become too dense.

### Q8. What should happen when a user returns each Thursday?

Accepted: an action-first dashboard and checklist hybrid, not a wizard. Actions
dominate roughly the first two-thirds of the initial desktop experience, with
analytics below or secondary.

### Q9. How much optimizer control should users have?

Accepted: no alternative modes. The optimizer's sole purpose is to ruthlessly
maximize projected personal voting-incentive return in USD using each token's
verified price at calculation time. Gas does not affect its allocation. It must
retain native amounts, explain its inputs, uncertainty, dilution, and result,
and recompute as votes or prices change, but it must not optimize for balance,
diversification, or favorites.

Accepted presentation: lead with `Projected this epoch: $X` for the active
epoch. Annualized APY is secondary, explicitly extrapolated context rather than
the objective.

Accepted freshness behavior: recalculate immediately before signing. If the
optimal allocation changed materially, show the old/new allocation and projected
USD delta and require acknowledgement. Never silently overwrite manual edits.
Material means at least one percentage point of target allocation or at least 1%
of projected epoch USD. The authoritative objective uses the current canonical
vote snapshot, not a hidden prediction of future votes. Optimize selected NFTs
globally, preselect all eligible positions, and refresh on relevant indexed
events with a modest fallback poll.

### Q10. Should saved strategies auto-apply or merely prefill?

Accepted: Matchbox Pro does not need saved strategies. Users can review and
manually adjust the current optimizer result before signing.

### Q11. Which notification channels matter first?

Accepted: in-app and email in v1. Telegram, browser push, and general Discord
delivery are later. Developer webhooks remain outside the focused developer API.
Initial alerts are voting-window closing, eligible position not voted,
configurable claimable value, configurable lock expiry, and transaction result.

### Q12. Should Matchbox estimate gas and recommend when to claim?

Accepted: yes, but label the estimate and never block a claim. Gas guidance does
not affect optimizer allocation.

Why it matters: “claim now versus accumulate” is a useful decision feature and
requires native gas pricing/history.

## Round 3 — Incentive providers and organization features

### Q13. Is an incentive “campaign” a real user object?

Accepted: yes. A campaign groups the user's intent, budget, epochs, deposits,
and results even though deposits remain independent on-chain actions. Recurring
campaigns create reminders only, not automated funding.

Why it matters: this unlocks ROI, comparisons, reminders, and team workflows.

### Q14. What outcome should campaign ROI optimize?

Possible measures:

- incremental veMEZO votes;
- incremental veBTC votes;
- boost increase;
- pool/validator vote share;
- incremental MEZO emissions;
- incremental BTC/LP yield;
- cost per acquired voter;
- retention across epochs.

Accepted: lead with cost per incremental vote weight, followed by
boost/share/emission change and estimated return. Do not collapse them into one
score or claim causality that cannot be demonstrated.

### Q15. Do teams/organizations belong in the consumer product?

Accepted: organizations manage validator/project profiles, campaigns, budgets,
alerts, and developer apps; individual wallets remain the transaction signers.
Organizations and campaigns follow the stable voter core rather than blocking
the first release.

Why it matters: validators and protocols are not single-person users, but team
roles significantly expand auth and audit requirements.

### Q16. Will Matchbox Pro have paid features?

Accepted: Matchbox Pro has no paid features. Do not add plan, entitlement,
billing, upgrade, or paywall architecture without a new owner decision.

## Round 4 — Developer platform

### Q17. Who are the actual first developers?

Answered: application developers who want a unified schema covering every
profile-backed type—boost, validator, pool, and standalone—and, with user
consent, Discord identity linked to the authorizing wallet.

### Q18. Is “Sign in with Matchbox” strategically important?

Superseded and accepted: yes. Restore Matchbox ID as a first-class general wallet
identity and sign-in product. Use standards-based scoped consent while retaining
the already accepted Discord claims and non-enumeration rule.

Why it matters: a public identity provider is a security product, not a small API
feature.

### Q19. Should Discord be exposed to third-party apps?

Accepted: expose Discord ID, username, display name, and avatar through explicit
field-level consent. Keep ID-only access available as a narrower scope. Do not
provide an enumerable arbitrary wallet-to-Discord directory.

### Q20. Are webhooks or query APIs more valuable initially?

Accepted: focused gauge-profile queries first. Webhooks are not in the initial
developer-platform scope.

### Q21. Should production API access be self-service?

Accepted: every REST developer API caller must register and authenticate every
call; there is no anonymous REST tier, but authenticated use is free. Discord
identity scopes require manual approval during beta. Public gauge-profile
development credentials are issued through the distinct developer console, and
production credentials follow registration plus automated abuse checks. Support
both publishable browser keys and server secret keys. The later-approved,
tightly bounded anonymous Matchbox MCP subset is the sole exception.

### Developer API commercial policy

Accepted: the API is free. Track usage and route cost to establish reasonable
limits and protect the service, not to meter billing.

## Round 5 — Brand, tone, and design handoff

### Q22. What should Matchbox Pro feel like?

Choose a primary direction or describe another:

- premium financial command center;
- warm, approachable consumer finance;
- playful on-chain strategy game;
- clean protocol-native terminal;
- editorial data product.

Accepted: a quiet premium incentive marketplace with a small amount of
protocol-native terminal character. Detailed visual design is delegated to the
separate design agent.

### Q23. How much protocol jargon belongs in primary UI?

Accepted: intent-first labels with protocol terms in secondary copy and expert
details.

Example: “Boost voting” with “BoostVoter contract” in the technical drawer.

### Q24. Should desktop density or mobile actionability lead?

Accepted: adaptive density—desktop comparison and a persistent ballot, with
mobile-specific action, Vote, Rewards, filter, and ballot patterns rather than
shrunk tables.

### Q25. What existing brand equity must survive?

Candidates:

- Matchbox name;
- flame/match icon;
- orange/Bitcoin color;
- monospace data typography;
- Trellium attribution;
- “liquidity layer for Mezo” positioning.

Accepted: keep the Matchbox name and current logo; the unused flame symbol stays
unused. Keep orange, restricted monospace, quiet attribution, and revised
incentive-marketplace positioning. A subtle ambient orange glow is welcome.

### Q26. Which theme strategy should ship?

Accepted: purpose-built dark and light themes, designed dark-mode first. Do not
ship an automatic color inversion as the light theme.

## Round 6 — Scope and delivery

### Q27. Is this a new repository or a next generation inside this monorepo?

Accepted: greenfield Pro workspaces inside this monorepo, sharing only audited
ABIs, fixtures, and deliberately extracted domain packages while old Matchbox
remains deployable during migration.

### Q28. What is the desired first-launch window?

Accepted scope: the complete voter core defined as Option B in
`08-brand-interface-and-launch-options.md`. Launch timing is intentionally unset
and milestone-driven.

### Q29. What does launch parity mean?

Accepted: strict self-contained parity before any public release. Every retained
high-value read must be reconciled and every retained write must be native,
safe, and complete in Pro. Closed alpha testing is permitted; a public beta may
not hand users to legacy Matchbox for an in-scope voter workflow.

### Q30. What existing capability can be retired?

Candidates to challenge:

- custom RPC selector;
- standalone Gauges list separate from opportunities;
- public Academy simulator;
- profile transfer semantics;
- Matchbox ID;
- separate developer host;
- How-to page inside the app;
- testnet in the primary UI;
- general activity explorer.

Accepted: apply the retirement/rehome matrix in
`08-brand-interface-and-launch-options.md`, except Matchbox ID is restored as a
general identity and consent product. Academy is fully retired. Testnet remains
developer-mode only. General activity is contextual plus an expert tool under
`More` until the separate next-phase Matchscan explorer replaces that role.

### Q31. Does Academy ship in Matchbox Pro?

Accepted: no. Academy is retired; do not port its UI, simulator, program engine,
or Discord role jobs.

### Q32. Where does general activity/explorer functionality live?

Accepted: contextual activity throughout Pro plus an expert explorer under
`More`. The separate next-phase Matchscan product becomes the fully fledged
Mezo explorer.

### Q33. Are there paid Pro features?

Accepted: no. Matchbox Pro and its registered developer API are free; usage
limits exist for reliability and abuse prevention, not billing.

## Remaining interview

All remaining owner-level questions—including new decisions discovered after
Q1–Q33—are consolidated in `07-owner-questionnaire.md`. Do not ask them
piecemeal or repeat accepted questions from this document.
