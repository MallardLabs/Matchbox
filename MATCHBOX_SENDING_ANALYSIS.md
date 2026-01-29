# Matchbox Sending Mechanisms Analysis

The "sending" mechanisms in Matchbox are primarily handled through on-chain transactions using the `BoostVoter` smart contract and off-chain data synchronization via Supabase.

## 1. Overview
Matchbox uses a hybrid approach:
*   **On-Chain (Transactions):** Critical actions like voting, creating gauges, and adding incentives are executed as transactions on the Mezo Network (using `wagmi` and `viem`).
*   **Off-Chain (Data):** Metadata profiles (names, descriptions, images) are "sent" to a Supabase database to avoid storing large data on-chain.

## 2. Adding Incentives (The "Sending Bribes" Flow)
The most complex "sending" operation is adding incentives to a gauge. This is handled in `apps/webapp/src/hooks/useVoting.ts` via the `useAddIncentives` hook.

### The Process:
1.  **Approval (`useApproveToken`):**
    *   Before sending incentives, the user must approve the `BoostVoter` contract to spend their tokens.
    *   This uses the standard ERC20 `approve` function.
    *   The frontend checks the current allowance using `useTokenAllowance`. If it's insufficient, the "Approve" button is shown.

2.  **Adding Incentives (`useAddIncentives`):**
    *   Once approved, the user can "send" the incentives.
    *   This calls the `addBribes` function on the `BoostVoter` contract.
    *   **Arguments:**
        *   `gaugeAddress`: The address of the gauge receiving the incentives.
        *   `tokens`: An array of token addresses (e.g., [USDC, MEZO]).
        *   `amounts`: An array of amounts corresponding to the tokens.
    *   **Under the hood:** The contract transfers the tokens from the user to the bribe contract associated with the gauge.

```typescript
// apps/webapp/src/hooks/useVoting.ts
const addIncentives = (
  gaugeAddress: Address,
  tokens: Address[],
  amounts: bigint[],
) => {
  // ...
  writeContract({
    address,
    abi,
    functionName: "addBribes",
    args: [gaugeAddress, tokens, amounts],
  })
}
```

## 3. Voting (Sending Votes)
Voting "sends" voting power to specific gauges. This is handled by `useVoteOnGauge` in `useVoting.ts`.

*   **Function:** calls `vote` on `BoostVoter`.
*   **Arguments:**
    *   `veMEZOTokenId`: The ID of the veMEZO NFT being used to vote.
    *   `gaugeAddresses`: List of gauges to vote for.
    *   `weights`: The amount of voting power allocated to each gauge.

## 4. Creating Gauges
Creating a gauge involves "sending" a request to the factory to deploy a new gauge contract. This is handled by `useCreateBoostGauge` in `useVoting.ts`.

*   **Function:** calls `createBoostGauge` on `BoostVoter`.
*   **Arguments:**
    *   `gaugeFactoryAddress`: The factory that deploys the gauge.
    *   `veBTCTokenId`: The veBTC NFT that the gauge will be associated with.
    *   `bribeTokens` & `bribeAmounts`: Initial incentives (optional).

## 5. Sending Profile Updates (Supabase)
Profile data (display name, description, social links) is sent off-chain to Supabase. This is handled in `apps/webapp/src/hooks/useGaugeProfiles.ts`.

*   **`useUpsertGaugeProfile`**: Sends a `POST`/`PUT` request to the `gauge_profiles` table in Supabase via the Supabase client.
*   **`useUploadProfilePicture`**: Uploads images to the `gauge-avatars` bucket in Supabase Storage.
*   **`useTransferGaugeProfile`**: Calls a Supabase Edge Function (`transfer-gauge-profile`) to handle the logic of transferring a profile from one gauge to another.

## Technical Stack Summary
*   **Blockchain Interaction:** `wagmi` (React hooks), `viem` (low-level client).
*   **Backend/Database:** Supabase (Postgres, Storage, Edge Functions).
*   **Contract Interface:** `BoostVoter` is the main entry point for all on-chain "sending" actions.
