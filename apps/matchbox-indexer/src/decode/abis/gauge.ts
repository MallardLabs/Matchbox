// Event fragments from apps/activity-subgraph/abis/Gauge.json on main,
// limited to the events the explorer subgraph handles. Generated; regenerate
// rather than hand-edit.

const gaugeAbi = [
  {
    type: "event",
    name: "Deposit",
    anonymous: false,
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true,
      },
      {
        name: "to",
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
  {
    type: "event",
    name: "Withdraw",
    anonymous: false,
    inputs: [
      {
        name: "from",
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
        name: "amount",
        type: "uint256",
        indexed: false,
      },
    ],
  },
] as const

export default gaugeAbi
