// Event fragments from apps/activity-subgraph/abis/MezoMinter.json on main,
// limited to the events the explorer subgraph handles. Generated; regenerate
// rather than hand-edit.

const mezoMinterAbi = [
  {
    type: "event",
    name: "EmissionsEnabled",
    anonymous: false,
    inputs: [
      {
        name: "activePeriod",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "EpochProcessed",
    anonymous: false,
    inputs: [
      {
        name: "period",
        type: "uint256",
        indexed: true,
      },
      {
        name: "epochIndex",
        type: "uint256",
        indexed: true,
      },
      {
        name: "emission",
        type: "uint256",
        indexed: false,
      },
      {
        name: "rebase",
        type: "uint256",
        indexed: false,
      },
      {
        name: "rewards",
        type: "uint256",
        indexed: false,
      },
      {
        name: "totalSupply",
        type: "uint256",
        indexed: false,
      },
      {
        name: "caller",
        type: "address",
        indexed: false,
      },
    ],
  },
] as const

export default mezoMinterAbi
