# Matchbox Pro owner questionnaire

Status: resolved decision record. Q1–Q33 recommendations were accepted or
otherwise resolved; Q34–Q40 were delegated to evidence-based implementation
ADRs. The authoritative accepted decisions are recorded in
`05-open-product-decisions.md` and `08-brand-interface-and-launch-options.md`.

Resolution update: the owner accepted the recommendations for Q1–Q21 and
delegated Q34–Q40 to evidence-based implementation ADRs. Q31 is resolved by
retiring Academy from Pro. Q33 is resolved: Matchbox Pro has no paid features.
Q22–Q33 are resolved in `08-brand-interface-and-launch-options.md`. Q29 requires
strict self-contained parity before any public release. Launch timing is
intentionally unset and milestone-driven.

For Q1–Q21, each recommendation below is now the accepted answer. Q34–Q40 remain
questions for implementation ADRs, not unresolved owner decisions.

## A. Vote, optimizer, and Rewards

1. **What counts as a material pre-sign optimizer change?**
   Recommendation: interrupt when any target changes by at least 1 percentage
   point or projected epoch USD changes by at least 1%; refresh smaller changes
   quietly without replacing manual edits.
2. **Should the authoritative optimizer use only the current canonical vote
   snapshot, or predict votes that may arrive later?** Recommendation: optimize
   the current snapshot only; show historical dilution risk as context, not as a
   hidden forecast inside the objective.
3. **Should optimization span all user-selected eligible NFTs as one global
   return problem?** Recommendation: yes, maximize their combined projected USD
   return while emitting the independent ballots/signatures each contract
   requires.
4. **Are all eligible positions selected automatically, or does the user choose
   positions before optimizing?** Recommendation: preselect all eligible
   positions, make the selection obvious, and allow deselection before
   calculation.
5. **How fresh should an optimizer result remain while Vote is open?**
   Recommendation: update on relevant indexed vote/incentive changes with a
   modest fallback poll; avoid a fixed high-frequency timer.
6. **Should `Claim all` be the primary Rewards action?** Recommendation: yes,
   with every source selected by default, per-source toggles, simulation, and
   separate transaction branches clearly shown.
7. **Should Matchbox estimate gas and suggest claim-now versus wait?**
   Recommendation: show the estimate and optional guidance, but never block a
   claim. This does not affect optimizer allocation.
8. **Do CSV and JSON voting-incentive history exports ship in Pro v1?**
   Recommendation: CSV in v1; JSON through the authenticated API or shortly
   afterward unless a real user need justifies both immediately.

## B. Alerts and recurring voter workflow

9. **Which notification channels ship first?** Recommendation: in-app and email;
   keep Telegram, browser push, and general Discord delivery for later.
10. **Which alert types ship first?** Recommendation: voting window closing,
    eligible position not voted, claimable incentive threshold, lock expiry, and
    transaction result. Watch-wallet alerts remain deferred as accepted.
11. **Should claimable-value and lock-expiry thresholds be configurable?**
    Recommendation: provide sensible presets plus custom values, with one
    notification per condition/epoch.

## C. Incentive providers, campaigns, and organizations

12. **Is a campaign a persistent Matchbox object grouping budget, epochs,
    deposits, and results?** Recommendation: yes; on-chain deposits remain
    independent transactions.
13. **Does recurring campaign scheduling create reminders or authorized
    transactions?** Recommendation: reminders only. Automated funding requires a
    separate future smart-account/security project.
14. **Which campaign result should lead?** Recommendation: lead with cost per
    incremental vote weight, then show boost/share/emission change and estimated
    return without claiming unsupported causality.
15. **Do teams/organizations ship in Pro?** Recommendation: yes for profile,
    campaign, developer-app, and audit management; wallets remain the only
    transaction signers.
16. **Do campaigns and organization tools ship at initial Pro launch or a later
    phase?** Recommendation: later phase after the voter marketplace and
    historical incentive ledger are stable.
17. **Does Matchbox execute veBTC pool voting inside the unified Vote workspace
    or link out to Mezo?** Recommendation: execute it inside Matchbox if current
    contracts permit safe simulation and parity; otherwise launch with an
    explicit temporary handoff.

## D. Developer platform operations

18. **May registered browser integrations use publishable keys, or is the API
    server-to-server only?** Recommendation: support both. Treat publishable
    keys as visible app identifiers protected by origin, app, session, and IP
    limits—not as secrets.
19. **How do gauge-profile-only apps receive production credentials?**
    Recommendation: automatically after registration and automated abuse checks;
    Discord scopes keep the accepted manual beta review.
20. **Are these reasonable beta limit hypotheses?** Development: 60 requests per
    minute and 5,000/day; production profile reads: 300/minute and 100,000/day;
    browser secondary limit: 60/minute per key + IP prefix; Discord identity:
    30/minute per app and 10/minute per authorizing user; page size: 100. All
    limits remain free and adjustable after telemetry.
21. **How should developers sign into the distinct console?** Recommendation:
    passkey plus email recovery first; add GitHub OAuth only if developer demand
    justifies it.

## E. Brand and interface direction

22. **Resolved:** quiet marketplace with a little protocol-terminal character;
    detailed visual work belongs to the separate design agent.
23. **Resolved:** layered intent-first language.
24. **Resolved:** adaptive density across desktop, tablet, and mobile.
25. **Resolved:** keep the Matchbox name/current logo, leave the unused flame
    unused, accept the remaining brand recommendations, and allow a subtle
    ambient orange glow.
26. **Resolved:** purpose-built dark and light themes, designed dark-mode first.

## F. Scope, migration, and launch

27. **Resolved:** greenfield Pro workspaces inside this monorepo.
28. **Resolved:** complete voter core with intentionally unset,
    milestone-driven launch timing.
29. **Resolved:** strict self-contained parity before any public release. Every
    retained write must be native in Pro; no public legacy handoffs.
30. **Resolved:** accept the retirement/rehome matrix except restore Matchbox ID
    as a general identity/consent product.
31. **Resolved: Academy is retired from Matchbox Pro.** Do not port its UI,
    simulator, program engine, or Discord role jobs.
32. **Resolved:** contextual activity plus an expert explorer under `More`.
    Matchscan becomes the separate fully fledged Mezo explorer next phase.
33. **Resolved: Matchbox Pro has no paid features.** Do not add billing, plans,
    entitlements, upgrade prompts, or paywalls.

## G. Engineering preferences the owner may delegate

These do not need owner answers if the implementation agent is authorized to
produce evidence-based ADRs.

34. **Preferred hosting/runtime provider?** Recommendation: benchmark two viable
    true Node 24 deployments against latency, PostgreSQL connectivity, jobs,
    observability, cost, and rollback needs.
35. **Preferred managed PostgreSQL provider and query/migration tooling?**
    Recommendation: decide through an ADR; avoid coupling domain logic to a
    provider SDK.
36. **Preferred indexer approach?** Recommendation: benchmark a small viem-based
    indexer against a maintained TypeScript framework using real Mezo logs and a
    reorg replay.
37. **Preferred job queue?** Recommendation: begin PostgreSQL-backed unless load
    tests demonstrate a need for separate infrastructure.
38. **Preferred account/session provider?** Recommendation: wallet-native account
    identity with secure HTTP-only sessions; choose a library/provider only
    after testing wallet-signature, passkey, organization, and consent needs.
39. **Preferred live and historical price providers?** Recommendation: define a
    primary, fallback, freshness policy, and approval test for every incentive
    asset rather than trusting one opaque latest-price endpoint.
40. **Does Goldsky remain production-critical?** Recommendation: use it for
    migration reconciliation/backfill initially; make Matchbox's raw ledger the
    authoritative product source once parity is proven.
