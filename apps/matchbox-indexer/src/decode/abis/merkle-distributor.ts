// Event fragments from apps/activity-subgraph/abis/MerkleDistributor.json on main,
// limited to the events the explorer subgraph handles. Generated; regenerate
// rather than hand-edit.

const merkleDistributorAbi = [
  {
    type: "event",
    name: "Claimed",
    anonymous: false,
    inputs: [
      {
        name: "distributionId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "index",
        type: "uint256",
        indexed: false,
      },
      {
        name: "account",
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
    name: "DistributionAdded",
    anonymous: false,
    inputs: [
      {
        name: "distributionId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "merkleRoot",
        type: "bytes32",
        indexed: false,
      },
      {
        name: "startTimestamp",
        type: "uint256",
        indexed: false,
      },
      {
        name: "handler",
        type: "address",
        indexed: false,
      },
      {
        name: "handlerData",
        type: "bytes",
        indexed: false,
      },
    ],
  },
] as const

export default merkleDistributorAbi
