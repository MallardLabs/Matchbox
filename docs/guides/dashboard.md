---
title: Dashboard Guide
description: Understanding and using the MatchBox Dashboard
---

# Dashboard Guide

The Dashboard is your central hub for monitoring all your MatchBox activity. Whether you're a veMEZO voter or veBTC gauge owner, the Dashboard provides a comprehensive view of your positions, rewards, and performance.

## Accessing the Dashboard

1. Connect your wallet to MatchBox
2. Click **Dashboard** in the navigation bar
3. Your personalized dashboard loads automatically

## Dashboard Overview

The Dashboard is organized into several key sections:

- **Portfolio Summary** - High-level view of your positions
- **veBTC Positions** - Your locked BTC and associated gauges
- **veMEZO Positions** - Your locked MEZO and voting power
- **Claimable Rewards** - Incentives ready to claim
- **Performance Metrics** - APY and earnings tracking

## Portfolio Summary

At the top of the Dashboard, you'll see:

| Metric | Description |
|--------|-------------|
| **Total Value Locked** | Combined value of all your positions |
| **Total Claimable** | Rewards waiting to be claimed |
| **Current APY** | Weighted average of your earnings |
| **Active Positions** | Number of veBTC and veMEZO NFTs |

## veBTC Positions Section

This section displays all your locked BTC positions.

### Position Card Information

Each veBTC card shows:

- **Token ID** - Unique identifier for your NFT
- **Locked Amount** - BTC locked in this position
- **Voting Power** - Your current unboosted power
- **Boost Multiplier** - Enhancement from veMEZO votes (1x-5x)
- **Lock Status** - Active, Permanent, or Expired
- **Unlock Date** - When you can withdraw (if not permanent)
- **Associated Gauge** - The gauge receiving votes for this position

### Position Actions

From each veBTC card, you can:

- **View Gauge Details** - See full gauge information
- **Manage Gauge** - Go to Incentives page for this gauge
- **View on Explorer** - See on-chain details

### Understanding Boost Display

The boost multiplier shows your current enhancement:

```
Unboosted Power × Boost Multiplier = Effective Power
```

Example: 0.5 veBTC × 2.5x boost = 1.25 effective voting power

## veMEZO Positions Section

This section displays all your locked MEZO positions.

### Position Card Information

Each veMEZO card shows:

- **Token ID** - Unique identifier for your NFT
- **Locked Amount** - MEZO locked in this position
- **Voting Power** - Your total available voting power
- **Used Weight** - How much is currently allocated to votes
- **Available Weight** - Remaining power to allocate
- **Lock Status** - Active or Expired
- **Unlock Date** - When your lock expires

### Position Actions

From each veMEZO card, you can:

- **Vote Now** - Go to Boost page with this position selected
- **View Allocations** - See current vote distribution
- **View on Explorer** - See on-chain details

### Voting Power Status

Your voting power display shows:

```
Total: 1,000 veMEZO
├── Used: 800 veMEZO (80%)
└── Available: 200 veMEZO (20%)
```

## Claimable Rewards Section

This is where you collect your earnings from voting.

### Rewards Display

For each claimable reward:

- **Token Type** - BTC, MEZO, or other tokens
- **Amount** - Quantity available to claim
- **USD Value** - Current dollar value
- **Source** - Which gauges generated these rewards

### Claiming Rewards

To claim your rewards:

1. Review the rewards you want to claim
2. Click **Claim** (individual) or **Claim All** (batch)
3. Approve the transaction in your wallet
4. Wait for confirmation
5. Tokens are transferred to your wallet

### Claim Strategies

| Strategy | When to Use |
|----------|-------------|
| **Claim All** | Large accumulated rewards, save on transactions |
| **Individual Claims** | Need specific tokens immediately |
| **Let Accumulate** | Small amounts, wait to save gas |

### Rewards Timing

- Rewards become claimable after each epoch ends
- No deadline to claim - they accumulate
- Claim whenever the transaction cost makes sense

## Performance Metrics

Track your earning performance over time.

### Current Epoch Stats

- **Projected Earnings** - Estimated rewards this epoch
- **Voting Allocation** - Where your veMEZO is allocated
- **Boost Status** - Current boost on your veBTC

### Historical Performance

- **Total Earned** - Lifetime rewards claimed
- **Average APY** - Historical return rate
- **Epochs Participated** - Your voting consistency

## APY Information

The Dashboard displays several APY metrics:

### For veMEZO Positions

| APY Type | Meaning |
|----------|---------|
| **Current APY** | Based on this epoch's actual earnings |
| **Projected APY** | Based on current allocations and incentives |
| **Historical APY** | Average over past epochs |

### For veBTC Positions

| APY Type | Meaning |
|----------|---------|
| **Base APY** | Earnings without boost |
| **Boosted APY** | Earnings with current boost |
| **Potential APY** | Earnings at maximum boost |

### APY Calculation Notes

- APY is annualized (weekly earnings × 52)
- Actual returns depend on market conditions
- Token price changes affect USD APY

## Dashboard Actions

### Quick Actions Bar

The Dashboard provides quick access to:

- **Vote** - Go directly to voting interface
- **Manage Gauge** - Go to gauge management
- **Claim All** - Claim all pending rewards
- **Refresh** - Update all data

### Notifications

The Dashboard may show alerts for:

- Epoch ending soon (time to vote)
- Significant rewards ready to claim
- Lock expiring soon
- Boost changes on your gauge

## Using the Position Carousel

When you have multiple positions, the carousel helps you navigate:

### Navigation

- **Arrow buttons** - Move left/right through positions
- **Dots** - Jump to specific position
- **Click** - Select position for detailed view

### Card Information

Each carousel card provides at-a-glance info:

- Position type (veBTC/veMEZO)
- Amount locked
- Key status (boost/power/expiry)
- Action indicator

## Dashboard Tips

### Regular Check-Ins

Visit your Dashboard:

- **Weekly (minimum)** - Each epoch to vote and claim
- **Daily (optional)** - Monitor performance and adjust

### What to Monitor

| Metric | Why It Matters |
|--------|----------------|
| **Claimable Rewards** | Don't let them accumulate too long |
| **Boost Multiplier** | Ensure you're maintaining desired boost |
| **Lock Expiry** | Plan renewals before expiration |
| **Vote Status** | Confirm votes are active each epoch |

### Red Flags

Watch for these warning signs:

- **Declining boost** - May need more incentives
- **Zero voting power** - Lock may have expired
- **Missed epochs** - Check your voting routine
- **APY drops** - Market conditions changing

## Troubleshooting

### Dashboard Not Loading

- Ensure wallet is connected
- Check you're on Mezo Network
- Try refreshing the page
- Clear browser cache if persistent

### Positions Not Showing

- Verify wallet address is correct
- Check for veBTC/veMEZO on Mezo Earn
- Try disconnecting/reconnecting wallet
- Wait a few moments for data to load

### Rewards Not Appearing

- Epoch may not have ended yet
- Transaction may still be processing
- Try refreshing the dashboard
- Check block explorer for confirmation

### Incorrect Balances

- Data may be cached - try refresh
- Check block explorer for accurate on-chain data
- Price feeds may be updating

## Next Steps

Now that you understand the Dashboard:

- [Voting Guide](/guides/voting) - Learn to vote effectively
- [Gauge Management Guide](/guides/managing-gauges) - Manage your veBTC gauge
- [Epochs and Timing](/concepts/epochs) - Master the weekly cycle
