// Event fragments of mUSD BorrowerOperations and TroveManager
// (mezo-org/musd solidity/contracts/interfaces). TroveUpdated has two
// signatures: the 8-argument one from musd 1.0.2 and the older 6-argument one
// (commit 414e5e2 added the rate and update time). Ingest stores all of these
// (src/ingest/topics.ts); the decoder reads TroveUpdated.

const musdTrovesAbi = [
  {
    type: "event",
    name: "TroveUpdated",
    anonymous: false,
    inputs: [
      { name: "_borrower", type: "address", indexed: true },
      { name: "_principal", type: "uint256", indexed: false },
      { name: "_interest", type: "uint256", indexed: false },
      { name: "_coll", type: "uint256", indexed: false },
      { name: "_stake", type: "uint256", indexed: false },
      { name: "_interestRate", type: "uint16", indexed: false },
      { name: "_lastInterestUpdateTime", type: "uint256", indexed: false },
      { name: "_operation", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TroveUpdated",
    anonymous: false,
    inputs: [
      { name: "_borrower", type: "address", indexed: true },
      { name: "_principal", type: "uint256", indexed: false },
      { name: "_interest", type: "uint256", indexed: false },
      { name: "_coll", type: "uint256", indexed: false },
      { name: "stake", type: "uint256", indexed: false },
      { name: "operation", type: "uint8", indexed: false },
    ],
  },
] as const

export default musdTrovesAbi
