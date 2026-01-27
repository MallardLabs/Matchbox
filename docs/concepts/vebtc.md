---
title: Understanding veBTC
description: Learn about veBTC - your locked BTC position on Mezo
---

# Understanding veBTC

veBTC (voting escrow BTC) is an NFT that represents your locked Bitcoin position on Mezo Network. When you lock BTC on Mezo Earn, you receive a veBTC NFT that tracks your lock and grants you voting power in the ecosystem.

## What is veBTC?

veBTC is the foundation of participation in Mezo's governance and rewards system. Each veBTC NFT contains:

- **Locked amount** - How much BTC you've locked
- **Lock duration** - When your lock expires (or if it's permanent)
- **Voting power** - Your influence in the system, based on amount and duration
- **Boost multiplier** - Enhancement from veMEZO votes (can reach up to 5x)
- **Associated gauge** - The smart contract that receives votes on your behalf

## How to Obtain veBTC

You obtain veBTC by locking BTC on [Mezo Earn](https://mezo.org/docs/users/mezo-earn/lock/vebtc):

1. Visit Mezo Earn
2. Navigate to the Lock section
3. Choose your lock amount (in BTC)
4. Select your lock duration (1-28 days)
5. Confirm the transaction
6. Receive your veBTC NFT

### Lock Duration Options

| Duration | Use Case |
|----------|----------|
| **1-7 days** | Short-term participation, test the waters |
| **7-14 days** | Medium-term commitment |
| **14-28 days** | Maximum initial voting power |
| **Permanent** | Opt-in for sustained maximum power |

## Voting Power and Decay

Your veBTC voting power is determined by:

**Voting Power = Locked Amount × (Time Remaining / Max Lock Duration)**

This means your voting power **decays linearly** as you approach your unlock date.

### Example

If you lock 1 BTC for 28 days:

- **Day 0**: 1 veBTC voting power
- **Day 14**: 0.5 veBTC voting power
- **Day 21**: 0.25 veBTC voting power
- **Day 28**: 0 veBTC (unlock available)

### Maintaining Your Voting Power

To prevent decay:

- **Extend your lock** - Add more time to reset decay
- **Enable permanent lock** - Maintain maximum voting power indefinitely

## Boost Multiplier

One of the most powerful features of veBTC is the ability to receive a **boost multiplier** from veMEZO votes. This is where MatchBox comes in.

### How Boosting Works

1. Your veBTC has a baseline voting power (unboosted)
2. veMEZO holders can vote on your gauge
3. These votes increase your boost multiplier
4. A higher boost means more rewards from Mezo Earn

### Boost Levels

| Boost | Meaning |
|-------|---------|
| **1.0x** | No boost - only your base veBTC power |
| **1.5x** | 50% increase in effective voting power |
| **2.5x** | 150% increase in effective voting power |
| **5.0x** | Maximum boost - 400% increase |

The maximum boost of 5x requires significant veMEZO support.

## Your Gauge

Every veBTC position is associated with a **gauge** - a smart contract address that:

- Receives votes from veMEZO holders
- Tracks your boost multiplier
- Can hold incentives to attract voters

On MatchBox, you can customize your gauge with:

- Display name and description
- Profile picture
- Social links
- Incentive offerings

See [Understanding Gauges](/concepts/gauges) for more details.

## Benefits of Holding veBTC

### 1. Governance Power

Control over mats (Mezo's incentive token) emissions across the ecosystem. Your votes direct where incentives flow.

### 2. Protocol Fee Share

Earn a share of chain activity and bridging fees proportional to your boosted voting weight.

### 3. Ecosystem Influence

Shape Mezo's economic direction by participating in governance decisions.

### 4. MatchBox Participation

On MatchBox, you can:

- Create a gauge profile to attract voters
- Offer incentives to boost your position
- Monitor your gauge's performance

## Key Considerations

### Lock-Up Period

Once locked, your BTC cannot be withdrawn until the lock expires (unless you have a permanent lock with specific unlock conditions).

### Epoch Alignment

Lock durations align to epoch boundaries (Thursday 00:00 UTC). This means your lock will round down to the nearest full week.

### Voting Requirement

To earn active rewards (beyond passive bridging fees), you must vote each epoch. Non-voting in an epoch forfeits active earnings for that period.

## veBTC in MatchBox

On MatchBox, veBTC holders can:

1. **View their positions** - See all veBTC NFTs in the Dashboard
2. **Manage gauge profiles** - Customize how your gauge appears to voters
3. **Add incentives** - Offer bribes to attract veMEZO votes
4. **Monitor performance** - Track boost multiplier, votes received, and APY
5. **Transfer profiles** - Move gauge settings between veBTC NFTs

## Next Steps

- [Understanding veMEZO](/concepts/vemezo) - Learn about the voting side
- [Understanding Gauges](/concepts/gauges) - Deep dive into gauge mechanics
- [Gauge Management Guide](/guides/managing-gauges) - Start managing your gauge

## Related Resources

- [Mezo Earn: veBTC Documentation](https://mezo.org/docs/users/mezo-earn/lock/vebtc)
