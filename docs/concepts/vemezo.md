---
title: Understanding veMEZO
description: Learn about veMEZO - your locked MEZO position with voting power
---

# Understanding veMEZO

veMEZO (voting escrow MEZO) is an NFT that represents your locked MEZO tokens on Mezo Network. While veMEZO doesn't provide independent voting power for governance, it grants the ability to **boost veBTC positions** and earn rewards in the process.

## What is veMEZO?

veMEZO is the key to the boosting mechanism in Mezo Earn. Each veMEZO NFT contains:

- **Locked amount** - How much MEZO you've locked
- **Lock duration** - When your lock expires (1-4 years)
- **Voting power** - Your ability to boost veBTC gauges
- **Used weight** - How much of your voting power is currently allocated
- **Unlock date** - When you can withdraw your MEZO

## How to Obtain veMEZO

You obtain veMEZO by locking MEZO tokens on [Mezo Earn](https://mezo.org/docs/users/mezo-earn/lock/vemezo):

1. Visit Mezo Earn
2. Navigate to the Lock section
3. Select MEZO as the token to lock
4. Choose your lock amount
5. Select your lock duration (1-4 years)
6. Confirm the transaction
7. Receive your veMEZO NFT

### Lock Duration Options

| Duration | Weight Multiplier | Use Case |
|----------|-------------------|----------|
| **1 year** | 0.25x of max | Minimum commitment |
| **2 years** | 0.5x of max | Medium-term participation |
| **3 years** | 0.75x of max | Stronger commitment |
| **4 years** | 1.0x (maximum) | Maximum voting power |

Longer locks mean more voting power and greater ability to earn rewards.

## Voting Power and Decay

Like veBTC, veMEZO voting power **decays linearly** over time:

**Voting Power = Locked Amount × (Time Remaining / Max Lock Duration)**

### Example

If you lock 1,000 MEZO for 4 years:

- **Year 0**: 1,000 veMEZO voting power
- **Year 2**: 500 veMEZO voting power
- **Year 3**: 250 veMEZO voting power
- **Year 4**: 0 veMEZO (unlock available)

### Maintaining Voting Power

To prevent decay:

- **Extend your lock** - Add time to maintain or increase power
- **Enable auto-max lock** - Automatically maintain maximum lock duration

## How veMEZO Works with veBTC

veMEZO's primary function is to **boost veBTC positions**. Here's how the relationship works:

```
veMEZO Holder                    veBTC Gauge
     │                               │
     │ Allocates voting power       │
     ├──────────────────────────────►│
     │                               │
     │                    Boost increased
     │                               │
     │ Earns bribes                 │ Higher rewards
     ◄──────────────────────────────┤
```

### The Boost Mechanism

1. veBTC holders have a base voting power
2. veMEZO holders vote on veBTC gauges
3. Votes increase the gauge's boost multiplier (up to 5x)
4. Higher boost = more rewards for the veBTC holder
5. In return, veMEZO voters earn incentives from the gauge

## Benefits of Holding veMEZO

### 1. Boost Multiplier for Others

Your veMEZO gives you the power to boost veBTC positions by up to 5x. This makes your voting power valuable in the ecosystem.

### 2. Earn Incentives (Bribes)

Through MatchBox, veBTC gauge owners offer incentives to attract your votes. By voting on their gauges, you earn a proportional share of these bribes.

### 3. Rebase Rewards

veMEZO holders receive weekly MEZO emissions that protect against dilution. The rebase amount depends on:

- Your veMEZO voting power
- Total veMEZO in the system
- Weekly emission schedule

### 4. Passive Income

Beyond active voting rewards, you earn from:

- Protocol fee distributions
- Rebase emissions
- MatchBox incentives

## Using veMEZO on MatchBox

On MatchBox, veMEZO holders can:

### Browse Gauges

View all available gauges with key metrics:

- Total veMEZO weight already voting
- Current boost multiplier
- Available incentives
- Projected APY if you vote

### Allocate Votes

Distribute your voting power across multiple gauges:

1. Select your veMEZO position
2. Choose gauges to support
3. Set percentage allocation for each
4. Confirm your vote transaction

### Monitor Earnings

Track your performance:

- Current APY from your voting allocations
- Earned bribes ready to claim
- Historical performance data

### Claim Rewards

Collect your earned incentives:

1. Visit the Dashboard
2. View claimable rewards
3. Claim to your wallet

## Voting Strategy Considerations

### Diversification vs. Concentration

- **Diversify**: Spread votes across multiple gauges to reduce risk
- **Concentrate**: Focus on high-APY gauges for maximum returns

### Gauge Selection Criteria

When choosing where to vote, consider:

| Factor | Why It Matters |
|--------|----------------|
| **Incentives offered** | Direct impact on your earnings |
| **Current vote weight** | Higher competition = lower APY per vote |
| **Gauge profile quality** | Indicates serious, long-term operators |
| **Historical performance** | Track record of consistent rewards |

### Timing

- **Vote early in epoch** - Secure your share before competition increases
- **Monitor throughout** - Adjust if better opportunities emerge
- **Don't miss epochs** - Votes reset weekly; non-voting forfeits rewards

## Key Considerations

### Long Lock Periods

veMEZO requires a minimum 1-year lock. Make sure you're comfortable with this commitment before locking.

### No Independent Governance Power

Unlike some protocols, veMEZO doesn't grant standalone governance voting rights. Its power comes from boosting veBTC positions.

### Active Participation Required

To maximize earnings, you need to:

- Vote each epoch
- Monitor gauge performance
- Claim accumulated rewards

## veMEZO in MatchBox

On MatchBox, your veMEZO enables you to:

1. **View your positions** - See all veMEZO NFTs in the Dashboard
2. **Browse gauges** - Explore all available opportunities
3. **Vote strategically** - Allocate power to maximize rewards
4. **Track APY** - Monitor current and projected earnings
5. **Claim bribes** - Collect rewards from your votes

## Next Steps

- [Understanding Gauges](/concepts/gauges) - Learn what you're voting on
- [Epochs and Timing](/concepts/epochs) - Master the weekly cycle
- [Voting Guide](/guides/voting) - Step-by-step voting instructions

## Related Resources

- [Mezo Earn: veMEZO Documentation](https://mezo.org/docs/users/mezo-earn/lock/vemezo)
