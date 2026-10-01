import {
  type Abi,
  type AbiEvent,
  type Address,
  type Hex,
  decodeEventLog,
  toEventSelector,
} from "viem"
import type { Network } from "../ingest/networks"
import type { RawLog } from "../ingest/rpc"
import type { ContractKind } from "../ingest/store"
import boostVoterAbi from "./abis/boost-voter"
import bribeVotingRewardAbi from "./abis/bribe-voting-reward"
import feeVotingRewardAbi from "./abis/fee-voting-reward"
import gaugeAbi from "./abis/gauge"
import merkleDistributorAbi from "./abis/merkle-distributor"
import mezoMinterAbi from "./abis/mezo-minter"
import musdSavingsRateAbi from "./abis/musd-savings-rate"
import nonPoolsVoterAbi from "./abis/non-pools-voter"
import pcvAbi from "./abis/pcv"
import poolAbi from "./abis/pool"
import poolFactoryAbi from "./abis/pool-factory"
import poolsVoterAbi from "./abis/pools-voter"
import rebaseDistributorAbi from "./abis/rebase-distributor"
import splitterAbi from "./abis/splitter"
import votingEscrowAbi from "./abis/voting-escrow"
import { OWNER_LOOKUP_ESCROWS } from "./constants"
import { boostVoterHandlers } from "./handlers/boost-voter"
import {
  thirdPartyVoterHandlers,
  validatorsVoterHandlers,
} from "./handlers/non-pools-voter"
import {
  gaugeHandlers,
  poolFactoryHandlers,
  poolHandlers,
} from "./handlers/pools-and-gauges"
import { poolsVoterHandlers } from "./handlers/pools-voter"
import {
  LEGACY_POOL_REWARDS,
  bribeVotingRewardHandlers,
  feeVotingRewardHandlers,
} from "./handlers/rewards"
import {
  chainFeeSplitterHandlers,
  merkleDistributorHandlers,
  mezoChainSplitterHandlers,
  mezoEcosystemSplitterHandlers,
  mezoMinterHandlers,
  musdSavingsRateHandlers,
  pcvHandlers,
  rebaseDistributorHandlers,
} from "./handlers/system"
import { votingEscrowHandlers } from "./handlers/voting-escrow"
import { type Handler, eventTopics, lockId, lower } from "./helpers"
import type { TemplateName } from "./rows"
import type { Store } from "./store"

// Which handler, if any, the explorer subgraph would run for a log. This is
// graph-node's data source model: a static source handles its address from
// its startBlock; a template handles an address from the block a handler
// created it in. Logs the ingest fetched for anything else (core contracts
// before 7,739,500, gauges and pools created before then) are skipped, which
// is what keeps the projection identical to matchbox-explorer 3.4.0.

type EventTable = {
  selectors: ReadonlyMap<Hex, string>
  events: ReadonlyMap<Hex, AbiEvent>
  handlers: Record<string, Handler>
}

type StaticSource = EventTable & {
  name: string
  address: Address
  startBlock: bigint
}

function eventTable(abi: Abi, handlers: Record<string, Handler>): EventTable {
  const selectors = new Map<Hex, string>()
  const events = new Map<Hex, AbiEvent>()
  for (const item of abi) {
    if (item.type === "event" && handlers[item.name] !== undefined) {
      const topic0 = toEventSelector(item)
      selectors.set(topic0, item.name)
      events.set(topic0, item)
    }
  }
  return { selectors, events, handlers }
}

const CORE_START_BLOCK = 7_739_500n

function staticSource(
  name: string,
  address: Address,
  abi: Abi,
  handlers: Record<string, Handler>,
  startBlock = CORE_START_BLOCK,
): StaticSource {
  return {
    name,
    address: lower(address),
    startBlock,
    ...eventTable(abi, handlers),
  }
}

// subgraph.yaml on main. Start blocks for the Legacy* reward contracts are
// their own creation blocks.
const LEGACY_START_BLOCKS: Record<string, bigint> = {
  "0x6f3e2afc81a8fd8e3490ddb032a91d339b371afb": 5_231_392n,
  "0x24e2d2efc692aab0ae54e0dd8b4c19aabc463c3b": 5_231_392n,
  "0x7c90026167ff9051fec3e14a5ec486e484722ded": 5_231_405n,
  "0xce8c65d38d3eb67263a658802cb86ce963679871": 5_231_405n,
  "0xa908809b0602606f86a745e13296881a9b267462": 5_231_405n,
  "0xbbb03e37546e051f2588e12c47f804a216320c10": 5_231_405n,
  "0x94a9a494872bf7231d8378d0aef7d32ba552e305": 5_231_418n,
  "0x0453820c89084e20658068a27ebb90824f1a6c6d": 5_231_418n,
  "0xa2e2f01f9342582557917d114cabcce4a26bb47f": 5_231_418n,
  "0x0fcf5322dedbe67b68208199db234e98ef54c888": 5_231_418n,
  "0x0377249dd6916f335048c7cd5541022b6ec2185c": 5_231_440n,
  "0x7ab52a8fc9f9100fec58a5ee319ddb872c1208d7": 5_231_440n,
  "0xf4c0067b6a38ca5b28fb2c8e1d8a2a20d20d2af3": 5_231_440n,
  "0xf702cd0c9fcfd453165aef6c84627937695d5a6c": 5_231_440n,
  "0x52a9a4310a1567ce828df137b2ead4883c0221cf": 5_231_459n,
  "0x4989d0128724b8b9d5d12bc98f1df9d4adafbbfa": 5_231_459n,
  "0xf2b88ec68c8fbd5261c5483d1385c46dc7619589": 5_231_459n,
  "0x898bbe9353dc576745724e8c64a02472645561cd": 5_231_459n,
}

// Even entries of LEGACY_POOL_REWARDS are bribe contracts, odd are fees.
function legacyRewardSources(): StaticSource[] {
  return LEGACY_POOL_REWARDS.map(function legacySource([reward], index) {
    const isBribe = index % 2 === 0
    const startBlock = LEGACY_START_BLOCKS[reward]
    if (startBlock === undefined) {
      throw new Error(`No start block for legacy reward contract ${reward}`)
    }
    return staticSource(
      isBribe ? "LegacyBribe" : "LegacyFee",
      reward,
      isBribe ? bribeVotingRewardAbi : feeVotingRewardAbi,
      isBribe ? bribeVotingRewardHandlers : feeVotingRewardHandlers,
      startBlock,
    )
  })
}

const MAINNET_SOURCES: StaticSource[] = [
  staticSource(
    "VeMEZO",
    "0xb90fdAd3DFD180458D62Cc6acedc983D78E20122",
    votingEscrowAbi,
    votingEscrowHandlers,
  ),
  staticSource(
    "VeBTC",
    "0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279",
    votingEscrowAbi,
    votingEscrowHandlers,
  ),
  staticSource(
    "BoostVoter",
    "0x2Ba614a598Cffa5a19d683cDCA97bac3a49313d1",
    boostVoterAbi,
    boostVoterHandlers,
  ),
  staticSource(
    "PoolsVoter",
    "0x48233cCC97B87Ba93bCA212cbEe48e3210211f03",
    poolsVoterAbi,
    poolsVoterHandlers,
  ),
  staticSource(
    "ThirdPartyVoter",
    "0x2e6D2F2CaCC1d24F9f9358030674eB307397A6EB",
    nonPoolsVoterAbi,
    thirdPartyVoterHandlers,
  ),
  staticSource(
    "ValidatorsVoter",
    "0xe99a9ad5Ed26BD30e4DB25397f378817e9b9515a",
    nonPoolsVoterAbi,
    validatorsVoterHandlers,
  ),
  staticSource(
    "ChainFeeSplitter",
    "0x0268ABa7FaB1ceC04ce557313C94D5832B407AA3",
    splitterAbi,
    chainFeeSplitterHandlers,
  ),
  staticSource(
    "MezoChainSplitter",
    "0x5C6eF634e279a77D64E21d24B1A1BB4A5e59C5DA",
    splitterAbi,
    mezoChainSplitterHandlers,
  ),
  staticSource(
    "MezoEcosystemSplitter",
    "0xe9e697D49d47c7042e768177F42d5789666D99FA",
    splitterAbi,
    mezoEcosystemSplitterHandlers,
  ),
  staticSource(
    "MezoMinter",
    "0x66Bff681611553b3204A226b2019ec621F39ffc3",
    mezoMinterAbi,
    mezoMinterHandlers,
  ),
  staticSource(
    "MezoRebaseDistributor",
    "0x075108F275Ed81c9CFc01065E6e50CEea81D6363",
    rebaseDistributorAbi,
    rebaseDistributorHandlers,
  ),
  staticSource(
    "MezoMerkleDistributor",
    "0xb91fBb559216683Aa2558596d96718407631E82d",
    merkleDistributorAbi,
    merkleDistributorHandlers,
  ),
  staticSource(
    "MUSDSavingsRate",
    "0xb4D498029af77680cD1eF828b967f010d06C51CC",
    musdSavingsRateAbi,
    musdSavingsRateHandlers,
  ),
  staticSource(
    "PCV",
    "0x391EcC7ffEFc48cff41D0F2Bb36e38b82180B993",
    pcvAbi,
    pcvHandlers,
  ),
  staticSource(
    "PoolFactory",
    "0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248",
    poolFactoryAbi,
    poolFactoryHandlers,
  ),
  staticSource(
    "PoolMusdBtc",
    "0x52e604c44417233b6CcEDDDc0d640A405Caacefb",
    poolAbi,
    poolHandlers,
  ),
  staticSource(
    "PoolMusdMusdc",
    "0xEd812AEc0Fecc8fD882Ac3eccC43f3aA80A6c356",
    poolAbi,
    poolHandlers,
  ),
  staticSource(
    "PoolMusdMusdt",
    "0x10906a9E9215939561597b4C8e4b98F93c02031A",
    poolAbi,
    poolHandlers,
  ),
  ...legacyRewardSources(),
]

const TEMPLATES: Record<TemplateName, EventTable> = {
  BribeVotingReward: eventTable(
    bribeVotingRewardAbi,
    bribeVotingRewardHandlers,
  ),
  FeeVotingReward: eventTable(feeVotingRewardAbi, feeVotingRewardHandlers),
  Gauge: eventTable(gaugeAbi, gaugeHandlers),
  Pool: eventTable(poolAbi, poolHandlers),
}

function sourcesByAddress(sources: StaticSource[]): Map<Address, StaticSource> {
  const byAddress = new Map<Address, StaticSource>()
  for (const source of sources) {
    if (byAddress.has(source.address)) {
      throw new Error(`Duplicate static data source ${source.address}`)
    }
    byAddress.set(source.address, source)
  }
  return byAddress
}

const STATIC_SOURCES: Record<Network, ReadonlyMap<Address, StaticSource>> = {
  mezo: sourcesByAddress(MAINNET_SOURCES),
  // The testnet explorer subgraph was deleted before this port. Testnet is
  // a config row later (docs/goldsky-exit.md, out of scope).
  "mezo-testnet": new Map(),
}

export function staticSourcesFor(network: Network): StaticSource[] {
  return [...STATIC_SOURCES[network].values()]
}

// Returns the handler graph-node would run for this log, or undefined when
// no active data source covers it.
export function resolveHandler(log: RawLog, store: Store): Handler | undefined {
  const address = lower(log.address)
  const topic0 = log.topics[0]
  if (topic0 === undefined) return undefined

  const staticSourceForLog = STATIC_SOURCES[log.network].get(address)
  let table: EventTable | undefined
  if (staticSourceForLog !== undefined) {
    if (log.blockNumber >= staticSourceForLog.startBlock) {
      table = staticSourceForLog
    }
  } else {
    const dynamic = store.getDataSource(address)
    if (dynamic !== undefined && log.blockNumber >= dynamic.createdBlock) {
      table = TEMPLATES[dynamic.template]
    }
  }
  if (table === undefined) return undefined

  const eventName = table.selectors.get(lower(topic0))
  return eventName === undefined ? undefined : table.handlers[eventName]
}

const ESCROW_SOURCES = new Set(["VeMEZO", "VeBTC"])
const VOTER_SOURCES = new Set([
  "BoostVoter",
  "PoolsVoter",
  "ThirdPartyVoter",
  "ValidatorsVoter",
])
// Voted and Abstained share a signature across all four voter ABIs.
const VOTE_SELECTORS = new Set<Hex>(
  nonPoolsVoterAbi
    .filter((item) => item.name === "Voted" || item.name === "Abstained")
    .map((item) => toEventSelector(item)),
)

// LockPosition ids a handler may read for this log, so a store backed by
// Postgres can load them before the synchronous handlers run. Escrow events
// touch their own tokenIds; votes may resolve the owner in any escrow.
export function lockKeysForLog(log: RawLog): string[] {
  const source = STATIC_SOURCES[log.network].get(lower(log.address))
  const topic0 = log.topics[0]
  if (source === undefined || topic0 === undefined) return []
  if (log.blockNumber < source.startBlock) return []

  if (VOTER_SOURCES.has(source.name) && VOTE_SELECTORS.has(lower(topic0))) {
    const tokenTopic = log.topics[3]
    if (tokenTopic === undefined) return []
    const tokenId = BigInt(tokenTopic)
    return OWNER_LOOKUP_ESCROWS.map((escrow) => lockId(escrow, tokenId))
  }

  if (!ESCROW_SOURCES.has(source.name)) return []
  if (!source.selectors.has(lower(topic0))) return []
  const event = decodeEventLog({
    abi: votingEscrowAbi,
    topics: eventTopics(log),
    data: log.data,
  })
  const escrow = source.address
  switch (event.eventName) {
    case "Merge":
      return [lockId(escrow, event.args._from), lockId(escrow, event.args._to)]
    case "Deposit":
    case "Withdraw":
    case "Transfer":
      return [lockId(escrow, event.args.tokenId)]
    case "LockPermanent":
    case "UnlockPermanent":
    case "UpdateBoost":
      return [lockId(escrow, event.args._tokenId)]
    default:
      return []
  }
}

// Contract kind (matchbox.contracts.kind) for each data source or template
// name, so ingest and decode agree on what a binding is.
const KIND_BY_NAME: Record<string, ContractKind> = {
  VeMEZO: "votingEscrow",
  VeBTC: "votingEscrow",
  BoostVoter: "boostVoter",
  PoolsVoter: "poolsVoter",
  ThirdPartyVoter: "thirdPartyVoter",
  ValidatorsVoter: "validatorsVoter",
  ChainFeeSplitter: "splitter",
  MezoChainSplitter: "splitter",
  MezoEcosystemSplitter: "splitter",
  MezoMinter: "minter",
  MezoRebaseDistributor: "rebaseDistributor",
  MezoMerkleDistributor: "merkleDistributor",
  MUSDSavingsRate: "musdSavingsRate",
  PCV: "pcv",
  PoolFactory: "poolFactory",
  PoolMusdBtc: "pool",
  PoolMusdMusdc: "pool",
  PoolMusdMusdt: "pool",
  LegacyBribe: "bribeVotingReward",
  LegacyFee: "feeVotingReward",
  BribeVotingReward: "bribeVotingReward",
  FeeVotingReward: "feeVotingReward",
  Gauge: "gauge",
  Pool: "pool",
}

export type HandlerBinding = {
  kind: ContractKind
  // Data source or template name; the template a handler runs under.
  name: string
  topic0: Hex
  eventName: string
  event: AbiEvent
  handler: Handler
}

// Every (data source or template, event) the decoder handles, deduplicated by
// (name, topic0). Static sources sharing a name (the Legacy* contracts) share
// their bindings.
export function handlerBindings(network: Network): HandlerBinding[] {
  const tables: Array<[string, EventTable]> = [
    ...[...STATIC_SOURCES[network].values()].map(
      (source): [string, EventTable] => [source.name, source],
    ),
    ...Object.entries(TEMPLATES),
  ]
  const bindings = new Map<string, HandlerBinding>()
  for (const [name, table] of tables) {
    const kind = KIND_BY_NAME[name]
    if (kind === undefined) throw new Error(`No contract kind for ${name}`)
    for (const [topic0, eventName] of table.selectors) {
      const handler = table.handlers[eventName]
      const event = table.events.get(topic0)
      if (handler === undefined || event === undefined) continue
      bindings.set(`${name}:${topic0}`, {
        kind,
        name,
        topic0,
        eventName,
        event,
        handler,
      })
    }
  }
  return [...bindings.values()]
}
