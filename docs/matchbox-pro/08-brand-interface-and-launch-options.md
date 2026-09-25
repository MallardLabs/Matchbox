# Matchbox Pro brand, interface, and launch options

Status: Q22–Q33 are resolved. Launch timing is intentionally unset and
milestone-driven.

## Accepted direction

- Q22: quiet incentive marketplace with a small amount of protocol-native
  terminal character; the separate design agent owns the detailed visual system.
- Q23: layered intent-first language.
- Q24: adaptive density.
- Q25: keep the Matchbox name and current logo; do not introduce the unused
  flame symbol. Accept the remaining recommendations, except that a subtle
  ambient orange glow is welcome.
- Q26: purpose-built dark and light themes, designed dark-mode first.
- Q27: greenfield Pro workspaces inside the current monorepo.
- Q28: complete voter-core launch.
- Q30: accept the retirement/rehome matrix except restore Matchbox ID as a
  first-class general identity and consent product.
- Q32: contextual activity plus an expert explorer under `More`; a separate
  next-phase Matchscan product becomes the full Mezo explorer.

## 1. Brand direction

### Option A — Quiet incentive marketplace (recommended foundation)

Matchbox feels like a premium market utility: calm, exact, quick, and highly
legible. Warm off-white/stone or deep ink surfaces carry a scarce orange signal.
The product leads with actions and projected epoch dollars, while technical
detail opens on demand.

Strengths:

- trustworthy for financial decisions;
- accessible to newer veMEZO voters without frustrating experts;
- supports dense comparisons without becoming a terminal;
- ages better than trend-led crypto visuals.

Risks:

- can become generic fintech if the Matchbox symbol, typography, and editorial
  moments are not distinctive;
- restraint demands excellent spacing and data typography.

### Option B — Protocol-native terminal

Dark-first, compact, technical, and visibly on-chain. Addresses, epochs, gauges,
and contract state remain prominent.

Strengths: maximum expert credibility and density.

Risks: repeats the current product's weaknesses, raises the learning curve, and
can make Matchbox look like interchangeable crypto infrastructure.

### Option C — Warm consumer finance

Friendlier language, softer surfaces, larger cards, more explanation, and lower
initial density.

Strengths: approachable for first-time voters and strong on mobile.

Risks: power users outgrow it quickly; opportunity comparison and multi-NFT
workflows become card-heavy.

### Option D — Bitcoin editorial

Bold typography, print-like hierarchy, strong orange/black/cream identity, and
selective illustration or campaign art.

Strengths: memorable, brandable, and excellent for public gauge/campaign pages.

Risks: editorial scale can consume space needed by the voting workspace; strong
art direction is harder to sustain across every dense state.

### Accepted blend

Use Option A for the product system with a restrained amount of Option B's
technical density and protocol character. Do not reproduce the current terminal
chrome. The separate design agent owns the detailed visual expression, including
where the accepted ambient orange glow appears. Stuart Query extends this blend:
its universal command surface should feel native to the financial workspace,
while its full canvas can compose dense records, charts, comparisons, and
transaction review without becoming a generic chatbot.

## 2. Language and protocol jargon

### Option A — Protocol-first

Lead with `BoostVoter`, token IDs, emissions, and contract terminology. Precise,
but it makes users learn topology before intent.

### Option B — Layered intent-first (accepted)

Primary copy says what the user is doing: `Vote`, `Projected this epoch`,
`Claim incentives`, `Voting power`, and `Time remaining`. Secondary labels and
technical drawers expose gauge type, contract, token ID, raw amount, block, and
formula.

### Option C — Consumer-only language

Hide most protocol terms. This is initially friendly but makes support,
verification, and expert usage harder.

Accepted: Option B. Simplicity comes from hierarchy, not from removing
traceability.

## 3. Information density and responsive behavior

### Option A — Dense desktop terminal

Optimize large tables first and compress them for phones. Fast for experts but
poor for the primary action-oriented mobile workflow.

### Option B — Card-first mobile product

Use large cards everywhere. Clear on phones, but inefficient for comparing many
gauges and positions on desktop.

### Option C — Adaptive density (accepted)

- Desktop: compact comparison rows/table, persistent sidebar, stable ballot
  rail, sticky column context, and expandable technical detail.
- Tablet: reduced columns with the ballot in a sheet or collapsible rail.
- Mobile: decision-focused opportunity rows/cards, a safe-area ballot summary,
  filters in a sheet, and progressive technical detail.
- Do not add a user-facing “compact/cozy” density setting in v1; design the right
  density for each viewport.

## 4. Brand elements to preserve or retire

| Element                    | Options                                     | Recommendation                                                                                  |
| -------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Matchbox name              | keep / rename                               | Keep; `Pro` distinguishes the generation without discarding recognition.                        |
| Current logo               | keep / refine / retire                      | Keep the current logo.                                                                          |
| Unused flame symbol        | introduce / leave unused                    | Leave unused; do not add it to Pro.                                                             |
| Orange/Bitcoin color       | ambient everywhere / scarce signal / retire | Keep as a scarce selection/action signal.                                                       |
| Monospace typography       | entire UI / data only / none                | Use only for addresses, epochs, hashes, and select numeric detail.                              |
| Trellium attribution       | prominent / footer-about / remove           | Keep quietly in footer/about if attribution is desired or required.                             |
| “Liquidity layer for Mezo” | keep / replace                              | Replace if Pro's actual promise is incentives; candidate: `The incentive marketplace for Mezo`. |
| Current terminal motif     | keep / selectively reuse / retire           | Retire as the default visual identity.                                                          |

Possible product-level lines to test:

- `The incentive marketplace for Mezo.`
- `Put your voting power to work.`
- `Vote where the incentives are.`
- `Find the highest-return vote.`

The product UI should not require a slogan; this is primarily for landing,
metadata, and launch communication.

## 5. Theme strategy

### Option A — Light-first only

Fastest path to a distinctive editorial/financial identity. Risk: many crypto
users strongly prefer dark environments.

### Option B — Purpose-built light and dark at launch (accepted, dark-first)

Define both semantic token sets in Figma/Pencil and implementation. Dark is the
initial design reference; light is independently tuned rather than mechanically
inverted.

### Option C — Dark-first only

Familiar to protocol power users but more likely to resemble every other crypto
terminal.

Dark receives design attention first, but both purpose-built themes are part of
the accepted launch direction. Do not ship a weak auto-inverted light theme.

## 6. Interface character that remains fixed across options

- One sidebar and one Vote destination.
- One global `Search Matchbox or ask Stuart...` entry point, opened with
  Command-K/Ctrl-K. Navigation results are deterministic and never wait for a
  model response.
- Action-first Overview.
- Active-epoch projected USD is primary; APY is secondary.
- One accent per view; no default gradients, glass, or ornamental motion. A
  restrained, static ambient orange glow may appear on selected atmospheric
  shell surfaces, never as the main affordance or behind dense data.
- Structural loading states and stable layout during refresh.
- Accessible primitives, visible focus, tabular numerals, and reduced motion.
- Motion only for state/spatial continuity, using transform/opacity and no more
  than 200 ms for interaction feedback.
- Technical provenance remains accessible for every financial number.
- Generative answers use a trusted Matchbox component registry. They may render
  sortable records, charts, comparisons, citations, and transaction proposals;
  they never execute arbitrary model-generated UI code.

## 7. Repository and migration options

### Option A — Rewrite the existing apps in place

Lowest initial setup, highest regression and migration risk. It encourages old
routes, dependencies, and component boundaries to leak into Pro. Not
recommended.

### Option B — Greenfield Pro workspace inside this monorepo (accepted)

Create new web, API, indexer, worker, and developer-console workspaces while
sharing only audited ABIs, fixtures, and deliberately extracted domain packages.
Keep legacy Matchbox deployable until parity gates pass.

Benefits: clean architecture plus simple access to migration fixtures and
side-by-side CI. A future repository split remains possible.

### Option C — Completely separate repository now

Maximum isolation, but duplicates CI, fixtures, contract metadata, and migration
coordination before those boundaries are understood.

## 8. Launch-scope options

### Option A — veMEZO-first public beta

Ships Overview, veMEZO Vote/optimizer, Rewards/history/claims, watch-wallet
inspection, profiles, and delegation. veBTC power users temporarily use legacy
flows.

Best when schedule is aggressive. Risk: the “one Vote destination” launches
incomplete for the accepted secondary persona.

### Option B — Complete voter core (accepted Pro launch)

Ships:

- Overview and action checklist;
- wallet context and watch-wallet inspection;
- unified Vote across veMEZO boost, veBTC pool, and veBTC validator branches;
- ruthless current-snapshot optimizer and pre-sign refresh;
- unified Rewards, historical voting incentives, claims, and CSV export;
- opportunity, gauge, pool, and validator intelligence;
- profile management and delegated editing;
- in-app/email voter alerts;
- public read-only detail/share pages;
- Stuart Query across the command overlay, persistent workspace, and full
  canvas, including wallet-aware support and native generative UI;
- user-confirmed proposals for votes, sends, repayments, claims, approved swaps,
  Earn deposits, and zaps; and
- the stable stateless Matchbox MCP used by Stuart, with a bounded public tool
  surface for external agents.

Campaigns, organizations, the broader REST developer console, broader Portfolio,
watch-wallet alerts, JSON export UI, and automation follow later. The Matchbox
MCP foundation does not: it is part of the self-contained Pro release. Academy
and paid features never enter scope.

### Option C — Full current parity plus provider/developer suite

Adds campaigns, organizations, developer console/API, every legacy expert tool,
and all transaction branches before launch.

Strength: one large reveal. Risk: delays the voter value proposition and couples
several security/migration projects into one release. Not recommended.

### Recommended staged path

1. **Internal data alpha:** ledger/indexer reconciliation, optimizer fixtures,
   price invariants, BFF boundary, shadow APIs, and deterministic MCP tool
   contracts.
2. **Closed product alpha:** complete voter-core and Stuart Query journeys on
   selected wallets and fork/mainnet read snapshots; expose Matchbox MCP as a
   clearly versioned preview.
3. **Closed parity candidate:** every retained voter read is reconciled and every
   retained write is native, safe, and complete in Pro; Query proposals pass the
   same simulation and review gates as direct UI actions.
4. **First public release:** strict self-contained parity plus performance,
   accessibility, reconciliation, MCP compatibility, and rollback gates. No
   in-scope workflow hands users to legacy Matchbox. The stable MCP and Query
   ship together.
5. **Post-GA:** campaigns/organizations, the broader REST developer console, and
   user-authorized automations.

Launch timing is intentionally unset. Milestone gates, not an arbitrary date,
determine readiness.

## 9. Launch parity options

### Option A — Screen parity

Recreate every current page and control. This preserves accidental product
structure and conflicts with the greenfield mandate. Reject.

### Option B — Outcome parity with temporary fallback (rejected)

Every high-value read is reconciled. Every current on-chain write is available
in Pro or through a clearly labeled temporary legacy handoff. Pro owns the new
user journey, and each fallback has a dated removal criterion.

### Option C — Strict self-contained parity before any public release (accepted)

No public Pro until every retained write is native. Cleaner launch, slower user
feedback, and greater big-bang risk. Closed alpha testing and migration
telemetry provide feedback before the public gate without exposing a split
product experience.

Accepted: Option C applies to the first public release, including anything
labeled beta. No retained high-value voter workflow may depend on a legacy
handoff.

## 10. Capability retirement matrix

| Current capability                   | Preserve | Rehome                     | Retire        | Recommendation                                                           |
| ------------------------------------ | -------- | -------------------------- | ------------- | ------------------------------------------------------------------------ |
| Custom RPC selector                  |          | Developer mode             |               | Keep expert recovery without contaminating shared data.                  |
| Standalone Gauges list               |          | Vote/Gauges                |               | Merge discovery; keep a management view only where needed.               |
| Academy UI/simulator/program engine  |          |                            | Yes           | Already accepted.                                                        |
| Current profile-transfer semantics   |          |                            | Redesign      | Replace with stable profile identity and chain-reconciled authorization. |
| Matchbox ID/general identity product | Yes      | Identity/consent surface   |               | Restore it with standards-based authorization and explicit scopes.       |
| Distinct developer surface           | Yes      | Separate console/subdomain |               | Already accepted; it stays out of product navigation.                    |
| In-app How-to page                   |          | Contextual help/docs       | Page          | Replace generic instructions with help at the action.                    |
| Testnet in primary navigation        |          | Developer mode             | Primary entry | Already accepted.                                                        |
| General activity explorer            |          | `More` expert tool         | Maybe         | See next section.                                                        |
| Current dashboard/terminal layout    |          |                            | Yes           | Replace with action-first Overview and Rewards.                          |

## 11. Activity explorer options

### Option A — Keep it top-level

Best for analysts, but it competes with core voter navigation and makes raw
events feel like a primary user goal.

### Option B — Contextual activity plus expert explorer under `More` (accepted)

Show relevant events in wallet, Rewards, gauge, pool, validator, campaign, and
transaction histories. Keep a normalized expert explorer under `More` with deep
links and exports. In the next phase, Matchscan becomes the fully fledged
Mezo-tailored explorer and Matchbox Pro links its activity records to Matchscan.

### Option C — Retire the explorer completely

Simplest navigation, but removes a valuable debugging, support, and audit tool.

## 12. Accepted combined direction

- Brand: quiet incentive marketplace with a little protocol-terminal character;
  detailed visuals are delegated to the separate design agent.
- Language: layered intent-first.
- Density: adaptive by viewport.
- Brand equity: keep the Matchbox name and current logo, do not introduce the
  unused flame, retain a subtle ambient orange glow, restrict monospace, and
  replace the old positioning/terminal motif.
- Themes: purpose-built dark and light, designed dark-mode first.
- Repository: greenfield Pro workspaces in the current monorepo.
- Launch: complete voter core, staged behind data and transaction safety gates.
- Query: Stuart is the restrained Mezo copilot inside a universal command
  surface, persistent workspace, and full generative canvas.
- Actions: v1 proposals cover voting, sends, repayments, claims, approved swaps,
  Earn deposits, and zaps; every action remains user-confirmed.
- Platform: the stateless Matchbox MCP is the shared deterministic foundation
  for Stuart and external agents at public launch; the broader REST developer
  console may follow.
- Parity: strict self-contained parity before any public release; closed testing
  may continue until all retained voter flows pass the gate.
- Activity: contextual everywhere plus expert explorer under `More`; Matchscan
  becomes the separate full Mezo explorer in the next phase.
- Academy: retired.
- Paid features: none.

## 13. Launch timing

No calendar month or ecosystem event is targeted. The first public release
occurs when the complete voter core and strict parity gates pass.
