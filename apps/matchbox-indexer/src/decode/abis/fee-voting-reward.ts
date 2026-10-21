// Event fragments from apps/activity-subgraph/abis/FeeVotingReward.json on main,
// limited to the events the explorer subgraph handles. Generated; regenerate
// rather than hand-edit.

const feeVotingRewardAbi = [
  {
    type: "event",
    name: "NotifyReward",
    anonymous: false,
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true,
      },
      {
        name: "reward",
        type: "address",
        indexed: true,
      },
      {
        name: "epoch",
        type: "uint256",
        indexed: true,
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "ClaimRewards",
    anonymous: false,
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true,
      },
      {
        name: "reward",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
      },
    ],
  },
] as const

export default feeVotingRewardAbi
