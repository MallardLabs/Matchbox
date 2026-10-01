// Event fragments from apps/activity-subgraph/abis/MUSDSavingsRate.json on main,
// limited to the events the explorer subgraph handles. Generated; regenerate
// rather than hand-edit.

const musdSavingsRateAbi = [
  {
    type: "event",
    name: "Deposit",
    anonymous: false,
    inputs: [
      {
        name: "user",
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
    name: "ProtocolYieldReceived",
    anonymous: false,
    inputs: [
      {
        name: "amount",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "StrategyYieldReceived",
    anonymous: false,
    inputs: [
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
        name: "user",
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
    name: "YieldClaimed",
    anonymous: false,
    inputs: [
      {
        name: "user",
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

export default musdSavingsRateAbi
