---
title: Frequently Asked Questions
description: Common questions about Matchbox and Mezo Earn
---

# Frequently Asked Questions

Find answers to common questions about using Matchbox and participating in the Mezo Earn ecosystem.

## General Questions

### What is Matchbox?

Matchbox is a matching protocol that connects veBTC holders with veMEZO holders on the Mezo Network. It creates a marketplace where veBTC holders can offer incentives to attract voting power, and veMEZO holders can earn rewards by voting on gauges.

### How is Matchbox different from Mezo Earn?

Mezo Earn is the broader ecosystem where you lock BTC and MEZO to receive veBTC and veMEZO. Matchbox is specifically focused on the incentive marketplace - helping veBTC holders attract votes and veMEZO holders find the best voting opportunities.

### Do I need both veBTC and veMEZO to use Matchbox?

No. You can use Matchbox with either:

- **veMEZO only** - Vote on gauges and earn incentives
- **veBTC only** - Manage your gauge and attract votes
- **Both** - Participate on both sides of the marketplace

### Is Matchbox safe to use?

Matchbox interacts with audited smart contracts on the Mezo Network. However, as with any DeFi protocol, there are inherent risks. Never invest more than you can afford to lose, and always verify transactions before signing.

## veBTC Questions

### How do I get veBTC?

Lock BTC on [Mezo Earn](https://mezo.org/docs/users/mezo-earn/lock/vebtc). Choose your lock duration (1-28 days) and you'll receive a veBTC NFT representing your position.

### What's the minimum lock for veBTC?

The minimum lock duration is 1 day. There's no maximum BTC amount.

### Can I unlock my veBTC early?

No, once locked, your BTC cannot be withdrawn until the lock expires. Choose your lock duration carefully.

### What happens when my veBTC lock expires?

Your gauge becomes inactive and stops receiving votes. You can withdraw your BTC or create a new lock. If you have a profile, you can transfer it to a new veBTC position.

### Why is my boost multiplier not increasing?

Several reasons:

- Not enough veMEZO votes on your gauge
- You've reached the maximum 5x boost
- Voters haven't allocated yet this epoch
- Your incentives may not be competitive enough

### How much should I offer in incentives?

Check what comparable gauges are offering and aim for competitive APY. Start conservatively and adjust based on voter response.

## veMEZO Questions

### How do I get veMEZO?

Lock MEZO tokens on [Mezo Earn](https://mezo.org/docs/users/mezo-earn/lock/vemezo). Choose your lock duration (1-4 years) and you'll receive a veMEZO NFT with voting power.

### What's the minimum lock for veMEZO?

The minimum lock duration is 1 year. Longer locks provide more voting power.

### Can I unlock my veMEZO early?

No, veMEZO locks are for the full duration. The minimum is 1 year, so plan accordingly.

### Does my veMEZO voting power decrease over time?

Yes, voting power decays linearly toward your unlock date. You can extend your lock to maintain maximum power.

### Can I vote with multiple veMEZO positions?

Yes, each veMEZO NFT can be used to vote independently. Select each position separately on the Boost page.

## Voting Questions

### How do I vote?

1. Go to the Boost page
2. Select your veMEZO position
3. Browse gauges and their incentives
4. Allocate your voting power
5. Confirm the transaction

See the [Voting Guide](/guides/voting) for detailed instructions.

### Do my votes carry over to the next epoch?

No. Votes reset to zero at the start of each epoch (Thursday 00:00 UTC). You must vote every week to earn rewards.

### What happens if I don't vote?

You forfeit your share of incentive rewards for that epoch. Your veMEZO still earns rebase rewards, but you miss out on gauge bribes.

### Can I change my votes during an epoch?

Yes, you can reset and reallocate your votes anytime within the voting window.

### When is the voting window?

Voting is open from Thursday 01:00 UTC to Wednesday 23:00 UTC each week. The first and last hour of each epoch are locked.

### Why can't I vote?

Common reasons:

- Outside the voting window (first/last hour of epoch)
- No veMEZO in your wallet
- Wallet not connected to Mezo Network
- Insufficient BTC for gas

## Rewards Questions

### When can I claim my rewards?

Rewards become claimable after each epoch ends (Thursday 00:00 UTC).

### Is there a deadline to claim rewards?

No, rewards accumulate and don't expire. Claim when convenient.

### Why are my rewards lower than expected?

Possible reasons:

- More voters joined, diluting your share
- Incentive amounts changed
- Token prices fluctuated
- You allocated less voting power than intended

### What tokens can I earn?

Incentives can be in BTC, MEZO, or other allowlisted tokens, depending on what gauge owners offer.

### How is my reward share calculated?

Your share equals:

```
(Your Votes on Gauge / Total Votes on Gauge) × Total Incentives
```

## Gauge Management Questions

### How do I create a gauge profile?

1. Go to the Incentives page
2. Select your veBTC position
3. Fill in profile fields (name, description, picture, links)
4. Save your profile

See the [Gauge Management Guide](/guides/managing-gauges) for details.

### Can I edit my gauge profile?

Yes, update your profile anytime. Changes are immediately visible to voters.

### How do I add incentives to my gauge?

1. Go to the Incentives page
2. Select your veBTC position
3. Click Add Incentive
4. Choose token and amount
5. Confirm the transaction

### Can I remove incentives after adding them?

No, once deposited, incentives are committed for that epoch's voters.

### How do I transfer my gauge profile?

Use the Transfer Profile feature on the Incentives page to move your profile to a different veBTC NFT.

## Epoch Questions

### What is an epoch?

An epoch is a 7-day period (Sunday to Sunday UTC) that structures voting, reward calculation, and distribution.

### When do epochs start and end?

- **Start:** Thursday 00:00 UTC
- **End:** Wednesday 23:59 UTC

### Why are there voting restrictions?

The first and last hour of each epoch are locked for:

- Clean transitions between epochs
- Accurate reward calculations
- Prevention of last-second manipulation

### How do locks align with epochs?

Lock durations round down to full weeks, with expiry on Thursday 00:00 UTC.

## Technical Questions

### What wallet should I use?

Any WalletConnect-compatible wallet works, including MetaMask, Rainbow, and others.

### What network is Matchbox on?

Matchbox runs on the Mezo Network. Make sure your wallet is connected to the correct network.

### Why is my transaction failing?

Common causes:

- Insufficient BTC for gas
- Outside voting window
- Invalid allocation (doesn't sum to ≤100%)
- Network congestion

### How do I switch networks?

In your wallet, add or switch to the Mezo Network. Check Mezo documentation for RPC details.

## Troubleshooting

### Dashboard not loading

- Refresh the page
- Check wallet connection
- Verify you're on Mezo Network
- Clear browser cache

### Positions not showing

- Verify wallet address
- Check Mezo Earn for your locks
- Try disconnecting/reconnecting wallet
- Wait a few moments for data to sync

### Transaction stuck

- Check gas settings
- Try increasing gas price
- Wait for network congestion to clear
- Use block explorer to check status

### Can't connect wallet

- Update your wallet extension
- Try a different browser
- Clear cache and cookies
- Check for wallet conflicts

## Getting More Help

### Where can I learn more?

- [Mezo Earn Documentation](https://mezo.org/docs/users/mezo-earn)
- [Matchbox Guides](/guides/voting)
- [Glossary](/reference/glossary)

### How do I report a bug?

Contact the Matchbox team through official channels or community Discord.

### Where can I discuss strategies?

Join the Mezo community channels to discuss voting strategies and gauge management with other users.
