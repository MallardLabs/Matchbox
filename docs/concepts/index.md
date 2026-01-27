---
title: Core Concepts
description: Understanding the fundamentals of Matchbox and Mezo Earn
---

# Core Concepts

Before diving into Matchbox, it's important to understand the key concepts that power the platform. This section covers the fundamentals of the Mezo Earn ecosystem and how Matchbox fits in.

## Overview

Matchbox operates within the Mezo Earn ecosystem, which uses a voting escrow model to align incentives between token holders and the protocol. The key building blocks are:

- **veBTC** - Voting escrow BTC (your locked Bitcoin position)
- **veMEZO** - Voting escrow MEZO (your locked MEZO position)
- **Gauges** - Smart contracts that receive votes and distribute rewards
- **Epochs** - Weekly time periods that structure voting and rewards

## The Voting Escrow Model

Both veBTC and veMEZO follow a "voting escrow" pattern:

1. You lock tokens for a chosen duration
2. You receive an NFT representing your locked position
3. Your NFT has voting power based on lock amount and duration
4. Voting power decays linearly as you approach unlock

This model rewards long-term commitment: the longer you lock, the more influence you have.

## How Matchbox Fits In

Matchbox creates a marketplace where:

- **veBTC holders** can offer incentives to attract veMEZO votes to their gauge
- **veMEZO holders** can earn rewards by voting for gauges with attractive incentives

This creates a mutually beneficial relationship:

```
veBTC Holder                    veMEZO Holder
     │                               │
     │ Offers incentives            │
     ├──────────────────────────────►│
     │                               │
     │                    Votes on gauge
     │◄──────────────────────────────┤
     │                               │
     │ Receives boost               │ Earns bribes
     ▼                               ▼
```

## Concept Guides

Learn more about each concept:

- [veBTC](/concepts/vebtc) - Understanding your locked BTC position
- [veMEZO](/concepts/vemezo) - Understanding your locked MEZO position
- [Gauges](/concepts/gauges) - How gauges work and how to optimize them
- [Epochs](/concepts/epochs) - Weekly timing and voting windows

## Key Terms at a Glance

| Term | Definition |
|------|------------|
| **veBTC** | NFT representing locked BTC with voting power |
| **veMEZO** | NFT representing locked MEZO with voting power |
| **Gauge** | Smart contract that receives votes from veMEZO holders |
| **Boost** | Multiplier applied to veBTC voting power (up to 5x) |
| **Bribe** | Incentives offered to attract veMEZO votes |
| **Epoch** | 7-day voting period (Sunday to Sunday UTC) |
| **APY** | Annual Percentage Yield - your projected yearly return |

For a complete list of terms, see the [Glossary](/reference/glossary).

## Next Steps

We recommend reading the concept guides in order:

1. [veBTC](/concepts/vebtc) - Start here to understand your BTC position
2. [veMEZO](/concepts/vemezo) - Learn how voting power works
3. [Gauges](/concepts/gauges) - Understand the core mechanic
4. [Epochs](/concepts/epochs) - Master the timing

Then move on to the practical guides:

- [Voting Guide](/guides/voting) - For veMEZO holders
- [Gauge Management Guide](/guides/managing-gauges) - For veBTC holders
