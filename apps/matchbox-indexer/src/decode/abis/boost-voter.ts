// Event fragments from apps/activity-subgraph/abis/BoostVoter.json on main,
// limited to the events the explorer subgraph handles. Generated; regenerate
// rather than hand-edit.

const boostVoterAbi = [
  {
    type: "event",
    name: "Abstained",
    anonymous: false,
    inputs: [
      {
        name: "voter",
        type: "address",
        indexed: true,
      },
      {
        name: "gauge",
        type: "address",
        indexed: true,
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "weight",
        type: "uint256",
        indexed: false,
      },
      {
        name: "totalWeight",
        type: "uint256",
        indexed: false,
      },
      {
        name: "timestamp",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "GaugeCreated",
    anonymous: false,
    inputs: [
      {
        name: "gauge",
        type: "address",
        indexed: true,
      },
      {
        name: "bribeVotingReward",
        type: "address",
        indexed: true,
      },
      {
        name: "creator",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "Voted",
    anonymous: false,
    inputs: [
      {
        name: "voter",
        type: "address",
        indexed: true,
      },
      {
        name: "gauge",
        type: "address",
        indexed: true,
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "weight",
        type: "uint256",
        indexed: false,
      },
      {
        name: "totalWeight",
        type: "uint256",
        indexed: false,
      },
      {
        name: "timestamp",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "BoostPoked",
    anonymous: false,
    inputs: [
      {
        name: "boostableTokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "boost",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "BoostableTokenBurned",
    anonymous: false,
    inputs: [
      {
        name: "boostableTokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "gauge",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "BribesAdded",
    anonymous: false,
    inputs: [
      {
        name: "gauge",
        type: "address",
        indexed: true,
      },
      {
        name: "token",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
      },
      {
        name: "sender",
        type: "address",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "DistributeReward",
    anonymous: false,
    inputs: [
      {
        name: "sender",
        type: "address",
        indexed: true,
      },
      {
        name: "gauge",
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
    name: "GaugeKilled",
    anonymous: false,
    inputs: [
      {
        name: "gauge",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "GaugeRevived",
    anonymous: false,
    inputs: [
      {
        name: "gauge",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "NotifyReward",
    anonymous: false,
    inputs: [
      {
        name: "sender",
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

export default boostVoterAbi
