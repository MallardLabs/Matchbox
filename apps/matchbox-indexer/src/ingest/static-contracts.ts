import type { Address } from "viem"
import type { Network } from "./networks"
import { NETWORKS } from "./networks"
import type { ContractKind, RegisteredContract } from "./store"

// The explorer subgraph's static data sources (apps/activity-subgraph/
// subgraph.yaml on main). Kept in code so the Worker bundle needs no manifest;
// test/ingest/static-contracts.test.ts fails if the two drift.
//
// `createdBlock` is the first block ingest fetches the contract's logs from:
// the network start block for core contracts, the creation block for the
// Legacy* reward contracts. It is not the subgraph's startBlock (7,739,500).

type LegacyLink = { pool: Address; gauge: Address; fromBlock: bigint }

function staticContract(
  template: string,
  kind: ContractKind,
  address: Address,
  legacy?: LegacyLink,
): RegisteredContract {
  return {
    network: "mezo",
    address,
    kind,
    template,
    parent: null,
    pool: legacy?.pool ?? (kind === "pool" ? address : null),
    gauge: legacy?.gauge ?? null,
    createdBlock: legacy?.fromBlock ?? NETWORKS.mezo?.startBlock ?? 0n,
    createdTx: null,
  }
}

const MEZO_STATIC_CONTRACTS: RegisteredContract[] = [
  staticContract(
    "VeMEZO",
    "votingEscrow",
    "0xb90fdad3dfd180458d62cc6acedc983d78e20122",
  ),
  staticContract(
    "VeBTC",
    "votingEscrow",
    "0x3d4b1b884a7a1e59fe8589a3296ec8f8cbb6f279",
  ),
  staticContract(
    "BoostVoter",
    "boostVoter",
    "0x2ba614a598cffa5a19d683cdca97bac3a49313d1",
  ),
  staticContract(
    "PoolsVoter",
    "poolsVoter",
    "0x48233ccc97b87ba93bca212cbee48e3210211f03",
  ),
  staticContract(
    "ThirdPartyVoter",
    "thirdPartyVoter",
    "0x2e6d2f2cacc1d24f9f9358030674eb307397a6eb",
  ),
  staticContract(
    "ValidatorsVoter",
    "validatorsVoter",
    "0xe99a9ad5ed26bd30e4db25397f378817e9b9515a",
  ),
  staticContract(
    "ChainFeeSplitter",
    "splitter",
    "0x0268aba7fab1cec04ce557313c94d5832b407aa3",
  ),
  staticContract(
    "MezoChainSplitter",
    "splitter",
    "0x5c6ef634e279a77d64e21d24b1a1bb4a5e59c5da",
  ),
  staticContract(
    "MezoEcosystemSplitter",
    "splitter",
    "0xe9e697d49d47c7042e768177f42d5789666d99fa",
  ),
  staticContract(
    "MezoMinter",
    "minter",
    "0x66bff681611553b3204a226b2019ec621f39ffc3",
  ),
  staticContract(
    "MezoRebaseDistributor",
    "rebaseDistributor",
    "0x075108f275ed81c9cfc01065e6e50ceea81d6363",
  ),
  staticContract(
    "MezoMerkleDistributor",
    "merkleDistributor",
    "0xb91fbb559216683aa2558596d96718407631e82d",
  ),
  staticContract(
    "MUSDSavingsRate",
    "musdSavingsRate",
    "0xb4d498029af77680cd1ef828b967f010d06c51cc",
  ),
  staticContract("PCV", "pcv", "0x391ecc7ffefc48cff41d0f2bb36e38b82180b993"),
  staticContract(
    "PoolFactory",
    "poolFactory",
    "0x83fe469c636c4081b87ba5b3ae9991c6ed104248",
  ),
  staticContract(
    "PoolMusdBtc",
    "pool",
    "0x52e604c44417233b6ccedddc0d640a405caacefb",
  ),
  staticContract(
    "PoolMusdMusdc",
    "pool",
    "0xed812aec0fecc8fd882ac3eccc43f3aa80a6c356",
  ),
  staticContract(
    "PoolMusdMusdt",
    "pool",
    "0x10906a9e9215939561597b4c8e4b98f93c02031a",
  ),
  staticContract(
    "LegacyBribeMUSDmUSDT",
    "bribeVotingReward",
    "0x6f3e2afc81a8fd8e3490ddb032a91d339b371afb",
    {
      pool: "0x10906a9e9215939561597b4c8e4b98f93c02031a",
      gauge: "0x4887fa1c88f8927932e5e1545b3b29a1a29656e7",
      fromBlock: 5231392n,
    },
  ),
  staticContract(
    "LegacyBribeBTCmxSolvBTC",
    "bribeVotingReward",
    "0x7c90026167ff9051fec3e14a5ec486e484722ded",
    {
      pool: "0x329d64572f8922c3fe90d23a3c74a360d8ea6235",
      gauge: "0x3aecbfc4aa3fc152fbefd427f87db1e97226dc20",
      fromBlock: 5231405n,
    },
  ),
  staticContract(
    "LegacyBribeMUSDCmUSDT",
    "bribeVotingReward",
    "0xa908809b0602606f86a745e13296881a9b267462",
    {
      pool: "0x2a1ab0224a7a608d3a992cb15594a2934f74f4c0",
      gauge: "0x548289b8983398db857efbb1e0cec489d72a6355",
      fromBlock: 5231405n,
    },
  ),
  staticContract(
    "LegacyBribeBTCMUSD",
    "bribeVotingReward",
    "0x94a9a494872bf7231d8378d0aef7d32ba552e305",
    {
      pool: "0x52e604c44417233b6ccedddc0d640a405caacefb",
      gauge: "0x8be20a5ff57e381025ae5e3a121b697269569aaf",
      fromBlock: 5231418n,
    },
  ),
  staticContract(
    "LegacyBribeMSolvBTCMUSD",
    "bribeVotingReward",
    "0xa2e2f01f9342582557917d114cabcce4a26bb47f",
    {
      pool: "0x5cd2a025c001e07ae354a4c22c3009908de1ac59",
      gauge: "0xf93b51466519b7c9ca318f1bde0524530632af90",
      fromBlock: 5231418n,
    },
  ),
  staticContract(
    "LegacyBribeMcbBTCBTC",
    "bribeVotingReward",
    "0x0377249dd6916f335048c7cd5541022b6ec2185c",
    {
      pool: "0x72e6b3f126cf4f6c90c08114ac29038a0e269210",
      gauge: "0xf482d0edb24c888d63a031de71d963c4f4fa79e4",
      fromBlock: 5231440n,
    },
  ),
  staticContract(
    "LegacyBribeMTMUSD",
    "bribeVotingReward",
    "0xf4c0067b6a38ca5b28fb2c8e1d8a2a20d20d2af3",
    {
      pool: "0x6688f868e9c81ee671867e77fbc618bbea2e9782",
      gauge: "0x39e06c2a671a237897ccbf9166a136eb5bdda432",
      fromBlock: 5231440n,
    },
  ),
  staticContract(
    "LegacyBribeBTCmSolvBTC",
    "bribeVotingReward",
    "0x52a9a4310a1567ce828df137b2ead4883c0221cf",
    {
      pool: "0xf6f950485b0a65828f07581ca979ef1271778d6a",
      gauge: "0x0edca8717ab81363ff722ab7bd45060800632ec8",
      fromBlock: 5231459n,
    },
  ),
  staticContract(
    "LegacyBribeMUSDCMUSD",
    "bribeVotingReward",
    "0xf2b88ec68c8fbd5261c5483d1385c46dc7619589",
    {
      pool: "0xed812aec0fecc8fd882ac3eccc43f3aa80a6c356",
      gauge: "0x2945401f5e015a122b482de0ea5bf92c005c3c75",
      fromBlock: 5231459n,
    },
  ),
  staticContract(
    "LegacyFeeMUSDmUSDT",
    "feeVotingReward",
    "0x24e2d2efc692aab0ae54e0dd8b4c19aabc463c3b",
    {
      pool: "0x10906a9e9215939561597b4c8e4b98f93c02031a",
      gauge: "0x4887fa1c88f8927932e5e1545b3b29a1a29656e7",
      fromBlock: 5231392n,
    },
  ),
  staticContract(
    "LegacyFeeBTCmxSolvBTC",
    "feeVotingReward",
    "0xce8c65d38d3eb67263a658802cb86ce963679871",
    {
      pool: "0x329d64572f8922c3fe90d23a3c74a360d8ea6235",
      gauge: "0x3aecbfc4aa3fc152fbefd427f87db1e97226dc20",
      fromBlock: 5231405n,
    },
  ),
  staticContract(
    "LegacyFeeMUSDCmUSDT",
    "feeVotingReward",
    "0xbbb03e37546e051f2588e12c47f804a216320c10",
    {
      pool: "0x2a1ab0224a7a608d3a992cb15594a2934f74f4c0",
      gauge: "0x548289b8983398db857efbb1e0cec489d72a6355",
      fromBlock: 5231405n,
    },
  ),
  staticContract(
    "LegacyFeeBTCMUSD",
    "feeVotingReward",
    "0x0453820c89084e20658068a27ebb90824f1a6c6d",
    {
      pool: "0x52e604c44417233b6ccedddc0d640a405caacefb",
      gauge: "0x8be20a5ff57e381025ae5e3a121b697269569aaf",
      fromBlock: 5231418n,
    },
  ),
  staticContract(
    "LegacyFeeMSolvBTCMUSD",
    "feeVotingReward",
    "0x0fcf5322dedbe67b68208199db234e98ef54c888",
    {
      pool: "0x5cd2a025c001e07ae354a4c22c3009908de1ac59",
      gauge: "0xf93b51466519b7c9ca318f1bde0524530632af90",
      fromBlock: 5231418n,
    },
  ),
  staticContract(
    "LegacyFeeMcbBTCBTC",
    "feeVotingReward",
    "0x7ab52a8fc9f9100fec58a5ee319ddb872c1208d7",
    {
      pool: "0x72e6b3f126cf4f6c90c08114ac29038a0e269210",
      gauge: "0xf482d0edb24c888d63a031de71d963c4f4fa79e4",
      fromBlock: 5231440n,
    },
  ),
  staticContract(
    "LegacyFeeMTMUSD",
    "feeVotingReward",
    "0xf702cd0c9fcfd453165aef6c84627937695d5a6c",
    {
      pool: "0x6688f868e9c81ee671867e77fbc618bbea2e9782",
      gauge: "0x39e06c2a671a237897ccbf9166a136eb5bdda432",
      fromBlock: 5231440n,
    },
  ),
  staticContract(
    "LegacyFeeBTCmSolvBTC",
    "feeVotingReward",
    "0x4989d0128724b8b9d5d12bc98f1df9d4adafbbfa",
    {
      pool: "0xf6f950485b0a65828f07581ca979ef1271778d6a",
      gauge: "0x0edca8717ab81363ff722ab7bd45060800632ec8",
      fromBlock: 5231459n,
    },
  ),
  staticContract(
    "LegacyFeeMUSDCMUSD",
    "feeVotingReward",
    "0x898bbe9353dc576745724e8c64a02472645561cd",
    {
      pool: "0xed812aec0fecc8fd882ac3eccc43f3aa80a6c356",
      gauge: "0x2945401f5e015a122b482de0ea5bf92c005c3c75",
      fromBlock: 5231459n,
    },
  ),
]

export const STATIC_CONTRACTS: Record<Network, RegisteredContract[]> = {
  mezo: MEZO_STATIC_CONTRACTS,
  "mezo-testnet": [],
}
