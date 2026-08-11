# Matchbox Pro design and frontend principles

Status: accepted direction plus implementation guardrails. Pencil/Figma remains
the visual source of truth.

## 1. Greenfield experience mandate

Matchbox Pro is not a reskin. Preserve contract behavior and user outcomes, but
redesign the information architecture, interaction model, visual system,
responsive behavior, component foundation, and frontend data flow from first
principles.

The result should feel:

- elegant rather than ornamental;
- tasteful rather than fashionable;
- financially trustworthy rather than casino-like;
- primarily like a quiet incentive marketplace, with a restrained amount of
  protocol-native density and technical character;
- quick and decisive rather than animated;
- approachable to a veMEZO voter, with exact protocol detail available on
  demand;
- dense enough for comparison without looking like an admin dashboard.

## 2. Navigation and information architecture

Use a website sidebar on desktop instead of the current top navigation.

Working first-pass destinations:

```text
Overview
Vote
Rewards
Gauges
More
  Activity
  Documentation
```

This is a design hypothesis, not a required label set. The important decisions
are:

- one `Vote` destination;
- veMEZO is the default voting context;
- Rewards owns claimable and historical voting incentives;
- gauge-owner and advanced tools do not compete with the primary voter journey;
- the connected wallet, network, theme, and account controls remain easy to
  reach without dominating navigation.
- `Search Matchbox or ask Stuart…` is a persistent shell capability opened by
  Command-K/Ctrl-K and an equivalent mobile control; Query is not another
  top-level navigation destination.

### Vote structure

At the top of Vote, use one simple choice:

```text
[ veMEZO ] [ veBTC ]
```

- `veMEZO` shows boost-gauge opportunities.
- `veBTC` shows compact `All / Pools / Validators` filters.
- The selected position(s), available power, epoch timing, and ballot summary
  remain stable while users search and compare.
- A desktop ballot may live in a quiet right rail or anchored panel; mobile uses
  a safe-area-aware bottom summary that expands into a sheet.
- Category-specific contract rules and signatures stay explicit even though
  discovery feels unified.

### Overview structure

Use a dashboard/action-checklist hybrid:

1. current epoch status and time remaining;
2. the two or three most important actions;
3. claimable voting incentives;
4. saved/watchlist changes;
5. concise marketplace analytics.

The action region should dominate roughly the first two-thirds of the initial
desktop experience. Analytics follows below or occupies a clearly secondary
region. Do not turn Overview into a wizard, a 50/50 analytics split, or a wall
of equal-weight metric cards.

### Query structure

Query moves through three spatial states:

1. a command overlay for instant navigation and entity lookup;
2. a persistent right-side Stuart workspace for substantive answers and
   follow-ups;
3. a full content canvas for rich records, comparisons, charts, vote
   composition, and transaction review.

The side workspace survives product navigation. The canvas retains the
composer, selected wallet, page context, filters, and thread. Complex actions
open the canvas automatically; short answers do not consume the full page.

Navigation-only searches remain ephemeral. Questions, actions, pinned live
views, and explicitly shared results create Query history.

## 3. Visual direction

- Prefer dark-mode-first restrained neutral surfaces with one warm
  Matchbox/Bitcoin accent per view. Also ship an independently tuned light
  theme; do not mechanically invert either token set.
- Avoid purple, multicolor gradients, glowing cards, glassmorphism, and casino
  visual language.
- A subtle static ambient orange glow is explicitly allowed on selected shell,
  hero, or atmospheric surfaces. It must not become the primary affordance,
  reduce contrast, animate, or create large blur/backdrop performance costs.
- Do not use other gradients unless a supplied design explicitly calls for one.
- Use hierarchy through typography, whitespace, dividers, surface tone, and
  alignment before adding containers.
- Avoid nesting every section in a rounded card. Tables, lists, and comparison
  regions can share a single surface.
- Avoid excessive pills, badges, and oversized border radii.
- Preserve the Matchbox orange as a scarce signal for selection, action, or a
  meaningful highlight, with the accepted ambient glow as the narrow exception.
- Keep the current Matchbox name and current logo. Do not introduce the unused
  flame symbol into the application or redesign the logo as part of Pro.
- Monospace may support addresses, token amounts, epochs, and technical detail;
  it should not make the entire application look like a terminal.
- Charts should be quiet, legible, and comparative. Avoid decorative area fills
  that obscure actual values.
- Stuart should feel present through voice, status, and useful composition, not
  through a generic AI mascot, rainbow treatment, or animated orb.
- Generative UI should avoid card soup: dense record rows, shared comparison
  surfaces, tables, and charts are preferred when they communicate the data more
  efficiently than isolated cards.

## 4. Typography and data presentation

- Use a high-quality sans-serif family for product UI and an intentional
  monospace companion for technical data.
- Use balanced headings and readable, compact body copy.
- Use tabular numerals for amounts, APY/APR, percentages, weights, and countdowns.
- Align comparable numbers by decimal or right edge.
- Always pair shortened addresses with copy and full-address inspection.
- Use explicit `—`, `Unpriced`, `Unavailable`, or `Not applicable`; never use
  zero as a visual fallback for missing data.
- Distinguish realized, claimable, estimated, and projected values in text, not
  color alone.
- Dense rows truncate safely and reveal the full value through an accessible
  detail surface.

## 5. Interaction principles

- Interaction feedback begins immediately and completes within 200 ms when it
  is purely local.
- Use animation only when it explains state or preserves spatial context.
- Animate compositor properties (`transform` and `opacity`) only.
- Respect reduced-motion preferences.
- Avoid animated large images, blur, backdrop filters, layout properties, and
  looping decoration.
- Use structural skeletons that match the final layout; do not replace an entire
  route with a centered spinner.
- Keep existing content stable during background refresh and mark stale data.
- Show errors beside the control or row that caused them, with a specific retry.
- Preserve pasted values in address, amount, URL, and search inputs.
- Every empty state has one useful explanation and one primary next action.
- Destructive or irreversible actions use an accessible alert dialog with exact
  target, token, amount, epoch, and consequence.
- Clarifications use compact option cards with a short consequence/definition,
  not unexplained pills. Native Query and MCP MRTR fallback share the same
  structured input model.
- Selecting a row, group, text passage, or chart interval may reveal contextual
  actions such as `Explain`, `Compare`, `Chart`, `Filter to similar`, or
  `Create support report`.
- Agent progress exposes operational steps, sources, counts, duration, and
  errors. Do not expose hidden chain-of-thought or private prompts.
- Transaction proposals use precise actions such as `Review vote` or
  `Review & deposit`; do not label a financial commitment merely `Accept`.

## 6. Accessible component foundation

- Use one accessible primitive system per interaction surface. Base UI is the
  recommended greenfield candidate; React Aria or Radix is acceptable if the
  design-system ADR selects it.
- Do not hand-build focus trapping, roving focus, menus, dialogs, listboxes, or
  combobox keyboard behavior.
- Icon-only buttons require accessible labels and visible focus.
- Touch targets, focus order, contrast, screen-reader names, and error
  relationships meet WCAG 2.2 AA.
- Charts expose equivalent summaries or tables.
- Color never carries status alone.
- Fixed mobile elements respect safe-area insets and dynamic viewport units.

## 7. Recommended current frontend baseline

Use current stable/LTS releases at project creation, pin exact versions, and
upgrade through deliberate dependency pull requests. “Latest” means current,
supported, and security-patched—not preview or canary.

Recommended baseline as of 2026-07-31:

- Next.js 16.2 Active LTS, patched to the latest 16.2 security release;
- React 19.2 stable;
- TypeScript strict mode;
- Tailwind CSS 4.3 with CSS-first design tokens;
- Base UI accessible primitives;
- `motion/react` only for purposeful JavaScript animation;
- `tw-animate-css` for small CSS entrances/micro-interactions if needed;
- `clsx` + `tailwind-merge` through one `cn` utility;
- TanStack Query for client server-state that cannot be satisfied by route data;
- wagmi + viem for wallet connection, simulation, signing, and submission;
- generated API client from the Matchbox Pro OpenAPI contract;
- Storybook or an equivalent isolated component workbench;
- Playwright for end-to-end and visual regression coverage.

The owner approved free reuse of selected components from
`https://beautiful-ui-five.vercel.app/` as implementation starting points. Audit
and refactor approval cards, streamed sourced answers, tool chips, task rows,
prompt bar, recommendation cards, context cards, diff/records/filter tables,
search, insights, and selection actions into the selected accessible primitive
system and Matchbox tokens. Record the exact upstream license/attribution before
release. Do not copy its brand, blue accent, patterned background, model picker,
reasoning transcript, mascot treatment, or prototype-local state architecture.

The Node 24 Fastify API remains a separate application. Do not place core
business logic in Next.js route handlers or Server Actions merely because the
frontend framework makes that convenient.

Official version references:

- [React versions](https://react.dev/versions)
- [Next.js releases](https://nextjs.org/blog)
- [Tailwind CSS releases](https://tailwindcss.com/blog)
- [Base UI](https://base-ui.com/react/overview/quick-start)

## 8. Snappiness and performance behavior

Perceived performance is a product requirement:

- render the persistent shell and useful cached public data immediately;
- prefetch likely sidebar destinations without downloading the entire product;
- stream slow personalized sections into stable reserved space;
- use server-provided wallet-voting-context and opportunity read models instead
  of browser RPC waterfalls;
- virtualize only genuinely large lists; ordinary lists should remain native and
  searchable;
- move expensive optimizer calculations to a worker thread when they can block
  input; the interface exposes one highest-projected-USD-return objective, not
  strategy modes;
- show the optimizer's block/timestamp and update projections as incoming votes
  change dilution; do not imply the prefilled result is guaranteed until signed;
- show the calculation-time USD price and native projected reward in optimizer
  details so users can understand cross-token comparisons;
- make `Projected this epoch: $X` the dominant optimizer result; place
  annualized APY beneath it as secondary extrapolated context rather than a
  competing headline;
- before signing, show a compact old-versus-refreshed allocation diff when the
  optimum materially changes; never replace manual edits without consent;
- debounce network search without delaying local filtering;
- return deterministic Query navigation/entity results without waiting for
  Stuart, then stream analysis into reserved structure;
- target local navigation results under 100 ms, a useful cached indexed state
  under 500 ms, and healthy Stuart response start around one second;
- preserve deterministic search, records, and transaction tooling when Groq is
  unavailable while clearly marking conversational reasoning unavailable;
- update ballot math synchronously and reconcile authoritative data in the
  background;
- lazy-load charts, advanced editors, and developer tools;
- never ship ABIs, charting packages, or wallet connectors to routes that do not
  use them.

Initial frontend budgets:

- route interaction response under 100 ms for local state;
- sidebar navigation shows the next stable shell within 200 ms when prefetched;
- no unexpected layout shift in core voting and rewards flows;
- public discovery LCP under 2.5 seconds at the 75th percentile on mobile;
- INP under 200 ms at the 75th percentile;
- initial JavaScript budget defined and enforced per route during the frontend
  ADR, not as one unlimited application bundle.

## 9. Responsive strategy

- Desktop optimizes opportunity comparison and a persistent ballot.
- Mobile optimizes overview actions, voting, rewards, and watch-wallet checks.
- Query uses a full-screen mobile sheet/canvas with a safe-area-aware persistent
  composer; it must not squeeze the desktop side workspace into a narrow column.
- Do not shrink wide desktop tables until they technically fit. Choose a compact
  mobile row/card with the most decision-relevant metrics.
- Filters open in an accessible sheet on small screens and summarize active
  filters when collapsed.
- The mobile ballot summary never hides the final list row or wallet controls.
- Test narrow phones, large phones, tablets, normal laptops, and wide desktops.

## 10. Design system deliverables

The Figma/Pencil handoff should define:

- semantic color and elevation tokens for dark and light themes, with dark mode
  designed first;
- typography and numeric styles;
- spacing, radius, border, and fixed z-index scales;
- responsive grids and sidebar behavior;
- buttons, inputs, select/combobox, tabs, filters, table/list, dialog, sheet,
  alert, tooltip, toast, skeleton, empty state, chart, wallet, opportunity card,
  position selector, ballot, transaction progress, and earnings row;
- Query overlay, side workspace, canvas, prompt bar, source cluster, activity
  trace, clarification/recommendation cards, task rows, support report preview,
  transaction/bridge records, selection actions, allocation diff, and zap route;
- hover, focus, active, disabled, loading, error, success, stale, unpriced, and
  disconnected states;
- long names, large numbers, unknown tokens, dozens of positions, partial data,
  and mobile overflow examples;
- destructive transaction confirmation examples;
- reduced-motion behavior.

## 11. Design acceptance review

Reject a design or implementation that:

- looks polished only with ideal demo data;
- hides missing/unpriced data as zero;
- needs a top navigation in addition to the accepted sidebar without rationale;
- splits voting back into unrelated top-level destinations;
- relies on animation, gradients, glowing components, or glass for hierarchy;
  the accepted subtle static ambient shell glow is not a hierarchy mechanism;
- puts every metric in an equal card;
- makes the primary action ambiguous;
- removes technical traceability in the name of simplicity;
- forces mobile users through a desktop table;
- causes wallet/network/loading state to shift the entire page;
- renders arbitrary model-generated code instead of trusted versioned Query
  components;
- exposes chain-of-thought, hides source freshness, or uses a vague confidence
  meter where deterministic data quality/provenance is available;
- makes a rich Query output look like a wall of chat bubbles or equal cards;
- copies the current terminal styling or component structure by default.
