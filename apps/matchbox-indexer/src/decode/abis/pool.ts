// Event fragments from apps/activity-subgraph/abis/Pool.json on main,
// limited to the events the explorer subgraph handles. Generated; regenerate
// rather than hand-edit.

const poolAbi = [
  {
    type: "event",
    name: "Mint",
    anonymous: false,
    inputs: [
      {
        name: "sender",
        type: "address",
        indexed: true,
      },
      {
        name: "amount0",
        type: "uint256",
        indexed: false,
      },
      {
        name: "amount1",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "Burn",
    anonymous: false,
    inputs: [
      {
        name: "sender",
        type: "address",
        indexed: true,
      },
      {
        name: "to",
        type: "address",
        indexed: true,
      },
      {
        name: "amount0",
        type: "uint256",
        indexed: false,
      },
      {
        name: "amount1",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "Swap",
    anonymous: false,
    inputs: [
      {
        name: "sender",
        type: "address",
        indexed: true,
      },
      {
        name: "to",
        type: "address",
        indexed: true,
      },
      {
        name: "amount0In",
        type: "uint256",
        indexed: false,
      },
      {
        name: "amount1In",
        type: "uint256",
        indexed: false,
      },
      {
        name: "amount0Out",
        type: "uint256",
        indexed: false,
      },
      {
        name: "amount1Out",
        type: "uint256",
        indexed: false,
      },
    ],
  },
] as const

export default poolAbi
