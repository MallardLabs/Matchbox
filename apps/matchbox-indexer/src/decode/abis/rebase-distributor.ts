// Event fragments from apps/activity-subgraph/abis/RebaseDistributor.json on main,
// limited to the events the explorer subgraph handles. Generated; regenerate
// rather than hand-edit.

const rebaseDistributorAbi = [
  {
    type: "event",
    name: "CheckpointToken",
    anonymous: false,
    inputs: [
      {
        name: "time",
        type: "uint256",
        indexed: false,
      },
      {
        name: "tokens",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "Claimed",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "epochStart",
        type: "uint256",
        indexed: true,
      },
      {
        name: "epochEnd",
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
] as const

export default rebaseDistributorAbi
