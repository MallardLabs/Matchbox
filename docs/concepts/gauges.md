---
title: Understanding Gauges
description: Learn how gauges work and how to optimize them on Matchbox
---

# Understanding Gauges

Gauges are the central mechanism connecting veBTC holders with veMEZO voters. Understanding how gauges work is essential for maximizing your returns on Matchbox, whether you're offering incentives or voting for rewards.

## What is a Gauge?

A gauge is a smart contract associated with a veBTC position. It serves as the destination for veMEZO votes and the source of incentives for voters.

Think of a gauge as a "booth" in a marketplace:

- **veBTC holders** set up their booth (gauge) and offer incentives
- **veMEZO holders** visit booths and allocate their voting power
- Both sides benefit from the exchange

## Gauge Anatomy

Each gauge has several key attributes:

### On-Chain Properties

| Property | Description |
|----------|-------------|
| **Gauge Address** | Unique smart contract identifier |
| **veBTC Token ID** | The veBTC NFT associated with this gauge |
| **veBTC Weight** | Voting power from the locked BTC |
| **Total veMEZO Weight** | Sum of all veMEZO votes for this gauge |
| **Boost Multiplier** | Current boost level (1x to 5x) |
| **Is Alive** | Whether the gauge is active |

### Matchbox Profile Properties

| Property | Description |
|----------|-------------|
| **Display Name** | Human-readable gauge name |
| **Description** | What the gauge represents or its strategy |
| **Profile Picture** | Visual identifier |
| **Social Links** | Twitter, Discord, Telegram, etc. |
| **Incentive Strategy** | How the owner plans to use incentives |
| **Voting Strategy** | The owner's approach to attracting votes |
| **Tags** | Categories for easier discovery |

## The Boost Multiplier

The boost multiplier is perhaps the most important gauge metric. It determines how much the veBTC holder's rewards are amplified.

### How Boost is Calculated

Boost depends on the ratio of veMEZO votes to veBTC voting power:

```
Boost = f(veMEZO Weight, veBTC Weight)
```

More veMEZO votes relative to veBTC power = higher boost.

### Boost Levels Explained

| Boost | Effective Power | Impact |
|-------|-----------------|--------|
| **1.0x** | Base only | No veMEZO support |
| **1.5x** | 150% of base | Moderate support |
| **2.5x** | 250% of base | Strong support |
| **5.0x** | 500% of base | Maximum (optimal veMEZO allocation) |

### Optimal veMEZO Target

Each gauge has an "optimal" amount of veMEZO votes needed to reach maximum boost. Matchbox displays this metric to help:

- **veBTC holders** understand how much support they need
- **veMEZO voters** identify gauges that could benefit most from their votes

## Incentives (Bribes)

Incentives are rewards offered by veBTC gauge owners to attract veMEZO votes.

### How Incentives Work

1. **veBTC holder** deposits tokens into their gauge as incentives
2. **veMEZO holders** see the incentives and vote for the gauge
3. At epoch end, incentives are distributed proportionally to voters
4. **Voters claim** their earned incentives on Matchbox

### Supported Incentive Tokens

Gauges can offer incentives in:

- **BTC** - Bitcoin
- **MEZO** - Mezo native token
- **Allowlisted tokens** - Other approved ERC-20 tokens

### Incentive Distribution

Incentives are split among all veMEZO voters based on their share:

```
Your Share = (Your veMEZO Votes / Total veMEZO Votes) × Total Incentives
```

**Example:** If a gauge has 100,000 total veMEZO votes and you contributed 5,000, you receive 5% of the incentives.

## APY Calculations

Matchbox calculates APY to help you evaluate opportunities.

### Current APY

Based on:

- Incentives already deposited
- Current voting allocations
- Your veMEZO voting power

### Projected APY

Based on:

- Your planned vote allocation
- Current gauge state
- Estimated weekly rewards extrapolated annually

### Factors Affecting APY

| Factor | Effect on APY |
|--------|---------------|
| **More incentives** | Higher APY for voters |
| **More competing votes** | Lower APY per voter |
| **Higher veMEZO power** | More absolute earnings |
| **Gauge performance** | Consistent rewards attract more votes |

## Gauge Profiles on Matchbox

Matchbox allows veBTC holders to create detailed profiles for their gauges.

### Why Profiles Matter

A well-crafted profile:

- **Builds trust** - Voters prefer gauges with clear identities
- **Explains strategy** - Helps voters understand your approach
- **Stands out** - Differentiates your gauge in the marketplace

### Profile Elements

1. **Display Name** - A memorable, recognizable name
2. **Description** - What you're building or your goals
3. **Profile Picture** - Visual branding
4. **Social Links** - Ways for voters to learn more
5. **Incentive Strategy** - How you plan to reward voters
6. **Voting Strategy** - Your approach to the ecosystem
7. **Tags** - Categories like "DeFi", "Infrastructure", etc.

## Browsing Gauges

On the Matchbox Gauges page, you can:

### View All Gauges

See every active gauge with key metrics at a glance.

### Sort and Filter

| Sort Option | Use Case |
|-------------|----------|
| **By APY** | Find highest-yielding opportunities |
| **By Boost** | See most/least boosted gauges |
| **By veMEZO Weight** | Find popular or underappreciated gauges |
| **By veBTC Weight** | See largest positions |

### Gauge Detail Page

Click any gauge to see:

- Full profile information
- Historical performance charts
- Current incentive breakdown
- Voting power distribution
- Social links and community info

## Gauge Performance Metrics

Matchbox tracks and displays several performance indicators:

### Real-Time Metrics

- Current boost multiplier
- Total veMEZO voting weight
- Active incentive amounts
- Projected weekly rewards

### Historical Data

- Daily gauge snapshots
- Boost trends over time
- Vote weight changes
- APY performance history

## For veBTC Holders: Optimizing Your Gauge

### Setting Up Your Gauge

1. Create a compelling profile
2. Add initial incentives to attract votes
3. Share your gauge on social media
4. Monitor and adjust your strategy

### Incentive Strategies

| Strategy | Description | Best For |
|----------|-------------|----------|
| **Consistent** | Same incentives each epoch | Building long-term relationships |
| **Aggressive** | High initial incentives | Quick boost acquisition |
| **Responsive** | Adjust based on votes received | Optimizing cost efficiency |

### Tips for Success

- **Start with clear branding** - Make your gauge memorable
- **Offer competitive incentives** - Check what others offer
- **Engage with voters** - Build community around your gauge
- **Monitor performance** - Adjust strategy based on results

## For veMEZO Holders: Evaluating Gauges

### What to Look For

1. **Incentive amount** - Higher is generally better
2. **Competition** - Too many votes dilutes your share
3. **Profile quality** - Indicates serious operators
4. **Consistency** - Check historical performance
5. **Boost level** - Under-boosted gauges may offer better APY

### Red Flags

- No profile or minimal information
- Inconsistent incentive history
- Very high existing vote concentration
- Unrealistic APY projections

## Next Steps

- [Epochs and Timing](/concepts/epochs) - Understand the weekly cycle
- [Voting Guide](/guides/voting) - Learn to vote effectively
- [Gauge Management Guide](/guides/managing-gauges) - Set up your gauge
