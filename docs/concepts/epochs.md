---
title: Epochs and Timing
description: Understanding the weekly epoch cycle in Mezo Earn and MatchBox
---

# Epochs and Timing

Mezo Earn operates on a weekly cycle called an "epoch." Understanding epoch timing is crucial for maximizing your rewards on MatchBox, as votes reset each week and missing an epoch means forfeiting that week's earnings.

## What is an Epoch?

An epoch is a 7-day period that structures voting, reward calculation, and distribution in the Mezo ecosystem.

### Epoch Basics

| Property | Value |
|----------|-------|
| **Duration** | 7 days (604,800 seconds) |
| **Start** | Thursday 00:00 UTC |
| **End** | Following Wednesday 23:59 UTC |
| **Cycle** | Continuous - each epoch follows the previous |

## The Weekly Cycle

Here's how a typical epoch unfolds:

### Thursday (Epoch Start)

- **New epoch begins** at 00:00 UTC
- Previous epoch's rewards finalize
- Votes from last epoch are reset
- New voting window opens (after first hour)

### Thursday - Wednesday (Voting Period)

- veMEZO holders allocate votes to gauges
- veBTC holders can add/adjust incentives
- APY projections update in real-time
- Votes accumulate throughout the week

### Wednesday (Epoch End)

- **Voting closes** at 23:00 UTC (1 hour before epoch end)
- Final vote tallies are locked
- Rewards are calculated
- Claims become available

## Voting Windows

Not all of the epoch is available for voting. There are restricted periods:

### Voting Restrictions

| Period | Status | Reason |
|--------|--------|--------|
| **First hour** (Thu 00:00-01:00 UTC) | Locked | Epoch transition processing |
| **Middle period** (Thu 01:00 - Wed 23:00 UTC) | Open | Normal voting window |
| **Last hour** (Wed 23:00-24:00 UTC) | Locked | Final calculation period |

### Why Restrictions Exist

The locked periods ensure:

- Clean transitions between epochs
- Accurate reward calculations
- Fair snapshot of final vote distribution
- Prevention of last-second manipulation

## Votes Don't Carry Over

**Important:** Your votes reset to zero at the start of each new epoch.

This means:

- You must vote **every week** to earn rewards
- Not voting = forfeiting that epoch's incentives
- Previous voting patterns don't automatically continue

### Weekly Commitment

To maximize earnings, plan to:

1. Check MatchBox early in each epoch
2. Evaluate current gauge opportunities
3. Allocate your veMEZO votes
4. Monitor throughout the week if desired

## Reward Calculation

Rewards are calculated based on the state at epoch end:

### For veMEZO Voters

Your reward share is determined by:

```
Your Rewards = (Your Votes on Gauge / Total Votes on Gauge) × Gauge Incentives
```

### For veBTC Holders

Your boost and rewards depend on:

- Total veMEZO votes received
- Your veBTC voting power
- Resulting boost multiplier

## Claiming Rewards

After an epoch ends:

### When to Claim

- Rewards become claimable after epoch transition
- No deadline to claim - they accumulate
- Claim whenever convenient (consider gas costs)

### How to Claim

1. Visit the MatchBox Dashboard
2. View your claimable rewards
3. Click "Claim" to receive tokens
4. Confirm the transaction

### Batch vs. Individual Claims

You can often claim rewards from multiple epochs at once to save on transaction fees.

## Lock Duration and Epoch Alignment

When locking BTC or MEZO, your lock duration aligns to epoch boundaries:

### How Alignment Works

- Lock durations round down to full weeks
- Locks expire on Thursday 00:00 UTC
- This ensures clean unlock timing

### Example

If you lock on a Monday for 28 days:

- Raw expiry would be ~4 weeks later on a Monday
- Actual expiry rounds to the previous Thursday
- This may be 2-3 days earlier than expected

## Timing Strategies

### For veMEZO Holders

| Strategy | Timing | Benefit |
|----------|--------|---------|
| **Early voting** | Thursday morning | Secure position early, reduce stress |
| **Mid-epoch** | Weekend | More data to evaluate |
| **Late voting** | Monday-Tuesday | See full picture, but riskier |

### For veBTC Holders

| Strategy | Timing | Benefit |
|----------|--------|---------|
| **Early incentives** | Thursday | Attract voters for full epoch |
| **Responsive** | Throughout | Adjust based on vote inflow |
| **Late push** | Mid-week | Attract last-minute voters |

## Important Dates to Track

### Weekly Milestones

- **Thursday 00:00 UTC** - Epoch starts, previous rewards finalize
- **Thursday 01:00 UTC** - Voting window opens
- **Wednesday 23:00 UTC** - Voting window closes
- **Wednesday 23:59 UTC** - Epoch ends

### Setting Reminders

Consider setting calendar reminders for:

- Epoch start (vote allocation)
- Mid-epoch (strategy review)
- Before close (final adjustments)

## Epoch Transitions

What happens during the transition:

1. **Epoch closes** - Final votes locked
2. **Rewards calculated** - Based on final state
3. **Claims enabled** - Previous epoch rewards available
4. **Reset** - All votes return to zero
5. **New epoch** - Fresh voting period begins

## Common Questions

### What if I vote but then get more veMEZO?

Your voting power is locked when you vote. If you acquire more veMEZO mid-epoch:

- Existing votes remain at old power
- You can allocate the new power separately
- Consider waiting until next epoch for simplicity

### Can I change my votes mid-epoch?

Yes, you can:

- Reset your votes and reallocate
- Adjust allocations between gauges
- Only final state at epoch end matters

### What if I miss an epoch?

If you don't vote during an epoch:

- You receive no incentive rewards for that period
- Your veMEZO still earns rebase rewards
- No penalty beyond missed earnings
- Simply vote in the next epoch

## Time Zone Reference

All epoch times are in **UTC**. Here are some common conversions:

| Time Zone | Epoch Start | Vote Close |
|-----------|-------------|------------|
| **UTC** | Thu 00:00 | Wed 23:00 |
| **EST (UTC-5)** | Wed 19:00 | Wed 18:00 |
| **PST (UTC-8)** | Wed 16:00 | Wed 15:00 |
| **CET (UTC+1)** | Thu 01:00 | Thu 00:00 |
| **JST (UTC+9)** | Thu 09:00 | Thu 08:00 |

## Next Steps

Now that you understand timing:

- [Voting Guide](/guides/voting) - Put your knowledge into action
- [Gauge Management Guide](/guides/managing-gauges) - Optimize your gauge timing
- [Dashboard Guide](/guides/dashboard) - Track your progress
