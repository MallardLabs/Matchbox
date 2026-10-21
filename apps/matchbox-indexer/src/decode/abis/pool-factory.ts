// Event fragments from apps/activity-subgraph/abis/PoolFactory.json on main,
// limited to the events the explorer subgraph handles. Generated; regenerate
// rather than hand-edit.

const poolFactoryAbi = [
  {
    type: "event",
    name: "PoolCreated",
    anonymous: false,
    inputs: [
      {
        name: "token0",
        type: "address",
        indexed: true,
      },
      {
        name: "token1",
        type: "address",
        indexed: true,
      },
      {
        name: "stable",
        type: "bool",
        indexed: true,
      },
      {
        name: "pool",
        type: "address",
        indexed: false,
      },
      {
        name: "arg4",
        type: "uint256",
        indexed: false,
      },
    ],
  },
] as const

export default poolFactoryAbi
