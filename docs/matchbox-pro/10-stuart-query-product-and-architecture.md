# Stuart Query product and architecture

Status: owner-approved product direction as of 2026-08-11. This document is the
source of truth for Query, the Stuart agent, and the Matchbox MCP. Where it
conflicts with an older statement that natural-language analytics, MCP access,
or swap execution is deferred, this document and the decisions recorded in
`05-open-product-decisions.md` take precedence.

## 1. Product definition

`Query` is the universal search, intelligence, and action surface in Matchbox
Pro. `Stuart` is the friendly but restrained Mezo agent inside Query.

Query combines three jobs without asking the user to select a mode:

1. Navigate to any Matchbox page or supported entity.
2. Understand Mezo, a selected wallet, Mezo Earn, gauges, incentives, loans,
   activity, and official support material.
3. Prepare safe, simulated, unsigned transactions for explicit wallet review
   and signature.

The persistent shell entry point is labeled:

```text
Search Matchbox or ask Stuart…                         Command-K / Ctrl-K
```

Query is the product/workspace name. Stuart is the agent name. History is
called `Query history`; a full workspace is a Query canvas.

Query is part of the free Matchbox Pro interface. It is not a paid plan or an
entitlement boundary.

## 2. Product principles

- Literal navigation and local entity matching never wait for an LLM.
- The model interprets intent and composes answers; deterministic services own
  financial facts, calculations, rankings, and transaction construction.
- The connected or selected watched wallet is always visible.
- Public chain data remains public. Matchbox-owned memory and account data are
  authenticated and consented separately.
- The canonical Optimizer has exactly one objective: maximize projected
  personal voting-incentive return in USD.
- Financial answers expose sources, freshness, snapshot/block, status, and
  calculation version.
- Generative UI means composing trusted Matchbox-native components, never
  executing arbitrary model-generated frontend code.
- Every write is prepared, refreshed, simulated, reviewed, and explicitly
  signed. Stuart never claims a proposal was submitted.
- The Matchbox MCP exposes the same deterministic capabilities that power
  Stuart so external agents do not need to rebuild Matchbox intelligence.
- Support answers admit uncertainty and provide a reviewed escalation path.

## 3. Users and wallet scope

Query supports three explicit address contexts:

- `Connected`: the signing wallet. Read, analyze, prepare, simulate, and sign.
- `Watching`: any public address saved by the connected-wallet account. Read
  and analyze only.
- `Inspecting`: any temporary public address that has not been saved. Read and
  analyze only.

One address is active at a time. Matchbox does not aggregate multiple owned
wallets into one account or portfolio. If a saved address becomes the connected
wallet, connected status takes precedence.

Watched and inspected wallets may display demonstrative transaction plans, but
the signing workflow remains disabled and says `Connect this wallet to
continue`.

Cross-chain activity is followed only when a bridge record explicitly links
source and destination activity. Query must not scan every supported chain
merely because the same hexadecimal address may exist there. A normalized bridge
journey can include provider, source/destination chain, transaction, address,
asset, amount, fees, status, timestamps, and finality.

## 4. Interaction model

### Command overlay

Command-K or Ctrl-K opens a global overlay. Results may be grouped as:

- `Go to`: Matchbox destinations and commands;
- `Entities`: gauges, pools, validators, tokens, addresses, NFTs, epochs, and
  transactions;
- `Your activity`: wallet-specific positions and events;
- `Answers`: Stuart analysis;
- `Actions`: supported workflows that can be prepared.

The overlay returns deterministic local and indexed results immediately while
Stuart begins any requested analysis. Pure navigation searches are ephemeral
and do not create history.

### Side workspace

A substantive question opens a persistent right-side Query workspace. It
survives Matchbox navigation and retains the thread, selected wallet, page
context, filters, and generated output.

Page context is visible and removable, for example:

```text
Using: MEZO/MUSD Vault
```

### Query canvas

Rich work expands into a full content canvas while preserving the composer.

The canvas opens automatically for:

- transaction preparation and review;
- vote composition;
- swaps, Earn deposits, and zaps;
- large result sets;
- multi-chart analysis;
- comparison and diff workflows.

Short answers remain in the side workspace. Other rich answers offer
`Open canvas`. Users may collapse the canvas without losing state.

Canvas state has a durable authenticated URL such as `/query/:threadId` and
survives refresh. The final route may change during information-architecture
design, but the deep-link and persistence behavior is required.

### History, pinned views, and sharing

- Questions, actions, pinned views, and shared results create history.
- Threads may be renamed, pinned, archived, searched, and deleted.
- Threads remain until deleted; account deletion removes them under the adopted
  retention policy.
- Historical answers preserve what Stuart said at that time and offer
  `Refresh with current data`.
- Pinned live views rerun against current data when opened while showing the
  last refresh, snapshot/block, and data status.
- Generated layouts may persist filters, sorting, chart period, visible
  columns, and selected presentation. V1 is not an arbitrary dashboard builder.
- Shared links contain only explicitly selected messages and UI blocks.
- Before sharing, warn that the selected wallet address, rendered results, and
  cited public chain activity become visible to anyone with the link. Never
  share memory, account details, hidden context, or unselected messages.
- Shared links are revocable and may expire after 24 hours, 7 days, 30 days, or
  never.

## 5. Stuart behavior

Stuart is friendly but restrained. Answers lead with the result, avoid filler,
and expose deeper reasoning through `Why?`, evidence, and calculation detail.
Stuart does not role-play, use excessive humor, or turn every answer into chat
bubbles.

Stuart may ask a material clarification through option cards. It should not ask
when the request is already unambiguous. The native Query client renders the
same structured request that an MCP client may handle through Multi Round-Trip
Requests or a structured fallback.

For `best gauges`, the approved choices are:

- `Best return for me`: invoke the canonical ruthless Optimizer;
- `Most incentives deposited`: rank by gross currently deposited incentive USD;
- `Most consistently funded`: rank by deterministic historical consistency.

`Highest incentives` is not an approved label because it can be confused with
highest personal return. A heavily diluted gauge may have the most deposited
incentives while producing a lower marginal return for the selected wallet.

The consistency view defaults to the last eight completed epochs with 4, 8, and
12 epoch controls. Its versioned deterministic score uses funded-epoch rate,
median verified incentive USD, volatility, and price confidence. The exact
formula and weights require a calculation specification and golden fixtures;
the LLM never invents them.

Stuart can answer why a gauge was not selected and may show dilution,
eligibility, pricing, marginal return, contract constraints, concentration, and
historical range. Concentration context does not change the Optimizer objective.
A user may manually edit or remove targets after optimization; that is a manual
override, not a second optimizer mode.

## 6. Supported knowledge and questions

### Navigation and entity resolution

- Matchbox pages and actions;
- gauges, pools, validators, tokens, contracts, NFTs, epochs, addresses, blocks,
  and transactions;
- names, labels, tags, symbols, and canonical addresses;
- selected filters and saved watch wallets.

### Personal Mezo activity

- bridge activity by provider, direction, asset, status, and time;
- deposits, withdrawals, swaps, repayments, claims, rewards, votes, and failed
  transactions;
- transaction explanation from decoded calls and canonical events;
- selected-wallet activity summaries and comparisons;
- links to the contextual Pro activity view and later canonical Matchscan pages.

### Loans and Mezo Earn

- troves/loans, collateral, debt, interest, collateral ratio, and repayment
  history;
- deterministic liquidation and price-change scenarios;
- approved Mezo Earn positions and deposits;
- approved swaps and zaps into supported vaults;
- position-specific explanations and next actions.

These are Mezo protocol read/action capabilities, not general portfolio
accounting. Cost basis, tax, cross-chain balance aggregation, general P&L, and
unrelated non-incentive portfolio analytics remain outside Pro.

### Gauges and incentives

- veBTC gauges voted on with veMEZO;
- pools and non-staking gauges voted on with veBTC;
- validator gauges voted on with veBTC;
- current, scheduled, and historical incentives;
- vote weight, dilution, emissions, funding consistency, and verified pricing;
- canonical Optimizer recommendations and editable ballots.

Current deposited, next-epoch scheduled, and historical incentives remain
separate in data and presentation.

### Mezo support

Stuart answers from this authority order:

1. canonical current chain state;
2. versioned Matchbox calculations and read models;
3. official Mezo and Matchbox documentation;
4. governance proposals and results;
5. audits and security disclosures;
6. official announcements and structured service status.

Community content and the open web are not searched by default. The user may
explicitly select `Search the web too`; community content remains labeled and
cannot override canonical or official evidence.

Every time-sensitive support answer cites its sources and freshness. Retrieved
documentation, profile text, token metadata, and external pages are untrusted
data and cannot instruct Stuart or redefine its tools.

## 7. Memory

Memory is available to authenticated connected-wallet accounts.

Stuart may remember:

- explanation depth and presentation preferences;
- saved wallet labels and watchlists;
- preferred funding assets;
- visible, editable transaction defaults such as slippage;
- chart, sorting, and notification preferences;
- user-defined references such as `my main trove`.

Stuart confirms meaningful durable memory with `Remember` and `Just this time`.
It must not silently learn from repeated behavior, though it may suggest a
memory after repetition.

Memory must never:

- store private keys, seed phrases, or secrets;
- turn stale balances into durable facts;
- authorize a transaction;
- alter the canonical Optimizer;
- infer the real-world identity of a watched address;
- attach one user's labels or notes to a public address globally.

Users can inspect, edit, export, delete individual memories, forget a category,
or erase all Stuart memory.

## 8. Generative UI

Stuart returns a structured response, conceptually:

```text
answer
evidence[]
uiBlocks[]
proposedActions[]
suggestedFollowups[]
activityTrace[]
```

The renderer accepts only versioned trusted components. Initial registry:

```text
query_answer
source_cluster
activity_trace
clarification_card
recommendation_card
task_group
metric_summary
transaction_records
bridge_records
activity_timeline
filter_bar
time_series_chart
distribution_chart
insight_card
context_evidence
comparison_table
allocation_diff
gauge_ranking
gauge_comparison
vote_composer
loan_position
scenario_model
zap_route
transaction_simulation
transaction_review
selection_actions
support_report_preview
```

The model chooses components, order, and validated inputs. It cannot emit raw
React, JavaScript, or arbitrary HTML for execution inside Matchbox.

Users may ask to change presentation, for example `show this as a table`,
`chart it`, or `group by token`. Filters, sorting, and selections modify the
current view rather than creating unrelated output.

Charts default to USD with a native-token toggle. Voting questions default to
the active epoch; general trends default to 90 days unless the question implies
a different range. Every chart has an accessible summary or data table.

V1 exports include CSV for record sets, copyable JSON for technical users, and
shared links. Token and protocol icons come from a verified registry with a
safe monogram fallback; arbitrary metadata URLs are not loaded as logos.

Inside Query these blocks render as native Pro components. External clients may
receive equivalent MCP Apps where supported.

### Beautiful UI implementation reference

The owner approved free reuse of the component examples at
`https://beautiful-ui-five.vercel.app/`. The following are implementation
starting points: approval card, streaming text, tool chips, task rows, prompt
bar, recommendation card, context cards, diff table, records/filter tables,
search, insight cards, and selection actions.

Reuse their interaction ideas and eligible code, but refactor them into the
Matchbox design system. Do not carry over the blue accent, patterned background,
model picker, exposed reasoning transcript, generic mascot treatment, tiny touch
targets, or prototype-local state architecture. Record the exact upstream
license and any required attribution in the dependency inventory before release.

## 9. Transaction actions

### V1 action catalog

Stuart may prepare and simulate:

- gauge votes;
- token sends;
- loan repayments;
- reward claims;
- swaps through approved routers;
- Mezo Earn deposits;
- zaps into approved Mezo Earn positions.

Bridge transactions are searchable and explainable in V1, but bridge execution
is deferred.

Swaps and zaps are limited to Matchbox-approved routers, assets, vaults, and
routes with deterministic quotes and simulations. Arbitrary contract calls are
not supported in V1.

### Lifecycle

```text
understand request
-> resolve entities and wallet
-> validate protocol constraints
-> prepare immutable expiring proposal
-> simulate
-> explain effects and independent signatures
-> refresh volatile data
-> show material changes
-> user reviews
-> wallet signs
```

Tool results use explicit proposal and simulation handles rather than hidden
transport session state. A proposal records network, wallet, calls, source
snapshot, quote, slippage, minimum output, approvals, calculation versions,
expiry, and a content hash.

- Swaps and zaps use action-specific short quote expiry, normally 30 to 120
  seconds subject to the route policy.
- Vote proposals may live longer but must refresh immediately before signing.
- Exact-amount token approval is the default. Unlimited approval is an expert
  choice with a plain-language warning.
- Slippage is route-aware, always visible, and editable. Remembered slippage may
  prefill but never hide the value.
- Compatible calls may be batched. Independent contract branches and sequential
  fallbacks remain visibly non-atomic.
- Partial success identifies every call and supports retrying failures without
  repeating successful calls.
- Warnings are contextual and identify the actual irreversible or unusual risk.
- Send review shows the full untruncated destination address.
- Route selection maximizes safe output after fees and price impact, not merely
  minimum gas, and shows materially different alternatives.

For a zap such as `$50 into the MEZO/MUSD vault`, Stuart resolves or asks for the
funding asset, shows the route and proportional assets, price impact, slippage,
fees, minimum received, expected vault shares, approvals, confirmations, and
simulation outcome.

## 10. Support reports

When Stuart cannot reconcile or confidently answer a support issue, it offers a
reviewed report to an internal structured support queue.

A report may include:

- user-written problem statement;
- selected conversation excerpts;
- wallet and network;
- relevant entities and transaction hashes;
- source block, finality, and indexer status;
- tool errors and request/trace IDs;
- calculation or decoder versions;
- user-approved contact method.

The user previews exactly what will be sent. Conversation content that was not
selected is excluded. Replies return to the Query thread and optionally to a
consented email address. `Helpful` and `Not right` feedback may feed an
evaluation queue; poor financial answers receive priority review.

## 11. Matchbox MCP

### Role and dependency direction

The MCP exposes Matchbox data and actions. It does not use an LLM to answer
ordinary deterministic tool calls.

```text
Mezo RPCs / indexers / prices / official knowledge
                         |
                         v
             Matchbox domain services
                         |
                         v
            stateless Matchbox MCP tools
                    /                 \
                   v                   v
          Stuart agent runtime     external agents
                   |
                   v
               Query UI
```

Stuart is the first-party MCP client. External agents may call primitive tools
or the high-level `ask_stuart` tool. `ask_stuart` invokes the Stuart runtime,
which receives a non-recursive allowed tool set.

### Protocol baseline

Implement MCP `2026-07-28` with:

- stateless, self-contained requests;
- per-request version, client identity, and capabilities;
- optional discovery;
- deterministic, cacheable lists;
- header-based method/tool routing;
- Multi Round-Trip Requests for clarification where supported;
- the formal MCP Apps extension for portable interactive UI;
- Tasks later for long-running work.

Stateless transport does not prohibit product state. Threads, memories,
proposals, support reports, and future automations are explicit authenticated
application records referenced by opaque handles.

Official references:

- [MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28)
- [MCP release notes](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview)

### Initial tool families

```text
Navigation and support
  search_matchbox
  resolve_entity
  search_mezo_knowledge
  get_governance_proposal
  get_protocol_status

Wallet and activity
  get_wallet_context
  search_transactions
  get_transaction
  list_loans
  get_loan
  list_earn_positions
  list_claimable_rewards
  get_current_votes

Gauges and optimization
  list_gauges
  get_gauge
  get_gauge_history
  rank_gauges
  optimize_votes

Unsigned actions
  prepare_vote
  prepare_send
  prepare_repayment
  prepare_claim
  prepare_swap
  prepare_earn_deposit
  prepare_zap
  simulate_transaction
  refresh_proposal
  build_unsigned_transaction

Agent and support
  ask_stuart
  create_support_report
  get_support_report
```

Names are an initial contract hypothesis. The implementation spec must define
input/output JSON Schemas, cost class, auth policy, freshness, pagination,
idempotency, evidence, error codes, and UI capability for each tool.

MCP never exposes a V1 signing tool. External transaction tools return validated
unsigned proposals; the host obtains consent and hands them to a compatible
wallet.

### Access and authorization

- Anonymous callers receive a tightly rate-limited subset of basic public Mezo
  knowledge and public chain reads.
- Free registered application credentials receive higher-volume public tools.
- User OAuth is required for memory, persistent threads, saved watch wallets,
  support history, and personalized continuity.
- Memory access uses granular scopes such as `memory:read` and `memory:write`;
  writes require visible consent.
- Public wallet data is not mislabeled as private because OAuth is present.
- The stable registered REST developer API may retain its credential-only
  policy. The anonymous MCP subset is an explicit, bounded exception and does
  not expose private developer or product APIs.
- Breaking schema changes use explicit versioning, compatibility tests,
  migration guidance, and a documented deprecation window.

`ask_stuart` supports public protocol/support questions under protective quotas.
Authenticated scopes are required for durable memory and threads. Raw tools do
not require attribution; a third-party interface presenting a response generated
by `ask_stuart` identifies Stuart as the responding agent.

### Rollout

1. Internal data alpha: implement tool handlers and schemas; Stuart is the first
   client.
2. Closed Pro alpha: external developer preview for read, knowledge, and unsigned
   proposal tools.
3. First public Pro release: stable public MCP, OAuth/client metadata,
   documentation, quotas, selected MCP Apps, and `ask_stuart`.
4. Post-V1: Tasks, broader automation management, and additional apps.

The MCP is foundational infrastructure and must not wait until the otherwise
later developer-console phase. Public polish may mature independently, but the
same domain handlers and contracts power Query from the beginning.

## 12. Stuart runtime on Groq

Use `openai/gpt-oss-120b` on Groq as the initial primary Stuart model. It is a
Groq production model with tool use and a large context window. Deterministic
search handles navigation. Do not add a multi-model router until traces and
evaluations prove that a smaller model improves cost or latency without reducing
correctness.

Matchbox controls the agent loop:

```text
Query -> Stuart orchestrator -> Groq inference
                              -> Matchbox MCP call
                              -> tool result
                              -> Groq synthesis
                              -> validated Query response
```

Do not depend on Groq-managed remote MCP for the initial architecture. Groq's
remote MCP integration is currently documented as beta and does not establish
support for every MCP 2026-07-28 extension. A Matchbox-controlled loop preserves
authorization, parallel domain reads, approval flow, observability, compatibility,
and low-latency in-process or same-region execution.

Official references:

- [Groq supported models](https://console.groq.com/docs/models)
- [Groq tool use](https://console.groq.com/docs/tool-use/overview)
- [Groq remote MCP](https://console.groq.com/docs/tool-use/remote-mcp)
- [Groq rate limits](https://console.groq.com/docs/rate-limits)

Capacity must be planned against the exact organization limits displayed by
Groq. Rate-limit headers drive backpressure and retry behavior.

During a Groq outage, deterministic navigation, search, records, and transaction
tools remain available. Query clearly marks conversational reasoning unavailable
rather than silently switching providers.

## 13. Activity traces and trust

Query may show operational progress, not private chain-of-thought:

```text
Resolved connected wallet
Loaded 18 eligible positions
Compared 42 gauges at block 12,482,113
Applied verified price snapshot
Simulated three ballot transactions
```

The activity trace may include tool names, sources, durations, counts, and
errors. It must not expose hidden prompts, reasoning tokens, secrets, or internal
credentials.

Every financial result labels exact, estimated, projected, inferred, live,
finalized, or historical status. Evidence records include source identifiers,
block/epoch/timestamp, price provenance, and calculation/decoder version.

## 14. Visual and accessibility requirements

Query follows `06-design-and-frontend-principles.md`:

- quiet incentive-marketplace character with restrained protocol density;
- dark-first and independently tuned light themes;
- scarce Matchbox orange for selection and action;
- no generic AI rainbow, purple gradient, glassmorphism, card wall, or animated
  mascot treatment;
- dense desktop tables/rows and intentional compact mobile cards;
- one accessible primitive system per interaction surface;
- visible focus, keyboard-complete Command-K and canvas, WCAG 2.2 AA;
- tabular numerals and full-address inspection;
- structural skeletons and stable background refresh;
- motion only for state/spatial continuity using transform/opacity, reduced
  motion, and interaction feedback no longer than 200 ms;
- charts with accessible summaries/tables;
- fixed mobile composer/actions respect safe-area insets and dynamic viewport
  units;
- errors appear beside the control, row, or transaction call that caused them.

## 15. Performance targets

- local navigation result: under 100 ms;
- first useful indexed/search state: under 500 ms where cached;
- Stuart begins a streamed response in approximately 1 second when healthy;
- ordinary sourced answer target: 2 to 4 seconds;
- long reads and simulations show progressive structural state rather than
  blocking behind generated prose;
- filters and sorting remain local after records load;
- large collections use cursor pagination and virtualization only when needed;
- MCP tool lists and stable knowledge resources publish safe cache hints;
- independent domain reads may fan out in the Matchbox orchestrator even when
  the selected model does not emit parallel calls.

These are product targets and require representative load and latency tests.

## 16. Security and privacy

- Private keys and seed phrases are never requested, stored, logged, or sent to
  Groq or MCP clients.
- Minimize and redact conversation traces; prefer structured tool telemetry.
- Define retention for threads, memory, support reports, model inputs/outputs,
  request metadata, and IP data before public testing.
- Tool descriptions and remote MCP metadata are untrusted unless served by the
  controlled Matchbox server.
- Enforce wallet/network scope at every tool and application boundary.
- Bind proposal handles to network, target wallet, exact content, and expiry.
- Prevent prompt injection from docs, profiles, token metadata, transaction
  calldata, support content, and external search.
- Require CSRF protection and secure HTTP-only sessions for first-party account
  mutations.
- Use OAuth/OIDC authorization hardened for MCP 2026-07-28 clients and explicit
  consent for Matchbox-owned data.
- Rate-limit by tool cost, application, account/wallet when authenticated, and
  IP prefix as secondary defense.
- Destructive Matchbox-owned data operations use accessible alert dialogs.

## 17. Evaluation and acceptance

Required automated evaluation families:

- golden natural-language query set;
- navigation and entity resolution;
- transaction and bridge classification;
- source authority and support citation correctness;
- hallucinated entity/transaction detection;
- tool selection, tool argument, and MCP schema compatibility;
- Optimizer invariants and deterministic consistency ranking fixtures;
- exact vote percentages, rounding, and independent ballot constraints;
- connected/watched/inspecting permission boundaries;
- swap/zap allowlist, quote, slippage, approval, and minimum-output safety;
- proposal expiry, pre-sign refresh, simulation, partial failure, and retries;
- memory consent and guarantee that memory does not alter the Optimizer;
- prompt-injection resistance;
- support report preview and redaction;
- generative UI schema, accessibility, responsive, and visual regression tests;
- Groq outage degradation and rate-limit backpressure.

Representative golden prompts include:

```text
wormhole transactions
bridge transactions
my last loan repayment
my loans
which validator has the most incentives right now
which gauges consistently have good incentives
vote on the best gauges this epoch for me
vote like the following: 30% to …
put $50 into the MEZO/MUSD vault
why did this transaction fail
compare this watched wallet's votes with mine
```

Completion requires correct sourced answers and safe product behavior, not only
plausible prose or polished demo UI.

## 18. Delivery sequence

### Query foundation

- canonical tool/result schemas;
- agent event and generative UI contracts;
- MCP 2026-07-28 server and first-party client;
- knowledge ingestion and source authority;
- memory, thread, share, and support-report models;
- transaction proposal/simulation state machine;
- Groq runtime, telemetry, and evaluation harness.

### High-fidelity vertical prototype

Demonstrate one connected journey:

1. Command-K query `wormhole transactions`;
2. instant results, side workspace, bridge canvas, filters, and selection actions;
3. `vote on the best gauges this epoch` with Optimizer allocation and refresh
   diff;
4. simulated vote review;
5. `$50 into the MEZO/MUSD vault` with approved zap route and review.

### Closed alpha and public gate

- reconcile every tool against canonical read models and contract fixtures;
- pass transaction, accessibility, privacy, performance, and rollback gates;
- publish external MCP preview during the closed alpha;
- publish stable Query and Matchbox MCP only with the self-contained Pro launch.

### Post-V1

- bridge execution after separate safety approval;
- watched-wallet alerts;
- MCP Tasks for long work;
- carefully scoped automations with policies, caps, expiry, pause/revocation,
  notification, simulation, and audit history;
- broader Matchbox Portfolio remains a separate later product.
