// Event fragments from apps/activity-subgraph/abis/Splitter.json on main,
// limited to the events the explorer subgraph handles. Generated; regenerate
// rather than hand-edit.

const splitterAbi = [
  {
    type: "event",
    name: "Nudge",
    anonymous: false,
    inputs: [
      {
        name: "_period",
        type: "uint256",
        indexed: true,
      },
      {
        name: "_oldRate",
        type: "uint256",
        indexed: false,
      },
      {
        name: "_newRate",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "PeriodUpdated",
    anonymous: false,
    inputs: [
      {
        name: "oldPeriod",
        type: "uint256",
        indexed: false,
      },
      {
        name: "newPeriod",
        type: "uint256",
        indexed: false,
      },
      {
        name: "firstRecipientAmount",
        type: "uint256",
        indexed: false,
      },
      {
        name: "secondRecipientAmount",
        type: "uint256",
        indexed: false,
      },
    ],
  },
] as const

export default splitterAbi
