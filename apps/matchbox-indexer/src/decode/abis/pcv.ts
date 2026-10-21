// Event fragments from apps/activity-subgraph/abis/PCV.json on main,
// limited to the events the explorer subgraph handles. Generated; regenerate
// rather than hand-edit.

const pcvAbi = [
  {
    type: "event",
    name: "PCVDistribution",
    anonymous: false,
    inputs: [
      {
        name: "_recipient",
        type: "address",
        indexed: false,
      },
      {
        name: "_amount",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "PCVDebtPayment",
    anonymous: false,
    inputs: [
      {
        name: "_paidDebt",
        type: "uint256",
        indexed: false,
      },
    ],
  },
] as const

export default pcvAbi
