// Event fragments from apps/activity-subgraph/abis/VotingEscrow.json on main,
// limited to the events the explorer subgraph handles. Generated; regenerate
// rather than hand-edit.

const votingEscrowAbi = [
  {
    type: "event",
    name: "Deposit",
    anonymous: false,
    inputs: [
      {
        name: "provider",
        type: "address",
        indexed: true,
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "depositType",
        type: "uint8",
        indexed: true,
      },
      {
        name: "value",
        type: "uint256",
        indexed: false,
      },
      {
        name: "locktime",
        type: "uint256",
        indexed: false,
      },
      {
        name: "ts",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "LockPermanent",
    anonymous: false,
    inputs: [
      {
        name: "_owner",
        type: "address",
        indexed: true,
      },
      {
        name: "_tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
      },
      {
        name: "_ts",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "Merge",
    anonymous: false,
    inputs: [
      {
        name: "_sender",
        type: "address",
        indexed: true,
      },
      {
        name: "_from",
        type: "uint256",
        indexed: true,
      },
      {
        name: "_to",
        type: "uint256",
        indexed: true,
      },
      {
        name: "_amountFrom",
        type: "uint256",
        indexed: false,
      },
      {
        name: "_amountTo",
        type: "uint256",
        indexed: false,
      },
      {
        name: "_amountFinal",
        type: "uint256",
        indexed: false,
      },
      {
        name: "_locktime",
        type: "uint256",
        indexed: false,
      },
      {
        name: "_ts",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "UnlockPermanent",
    anonymous: false,
    inputs: [
      {
        name: "_owner",
        type: "address",
        indexed: true,
      },
      {
        name: "_tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
      },
      {
        name: "_ts",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "UpdateBoost",
    anonymous: false,
    inputs: [
      {
        name: "_tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "_boost",
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
        name: "provider",
        type: "address",
        indexed: true,
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "value",
        type: "uint256",
        indexed: false,
      },
      {
        name: "ts",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "Transfer",
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
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
    ],
  },
] as const

export default votingEscrowAbi
