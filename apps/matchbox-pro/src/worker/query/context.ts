import type { Address } from "viem"
import type {
  WireEarnings,
  WireGaugeEpochs,
} from "../../features/history/schema"
import type { VoteBranch, WalletMode } from "../../features/query/contract"
import { gaugeEpochs } from "../history/gauges"
import { walletEarnings } from "../history/wallet"
import { type BoostState, loadBoostState } from "./providers/boost"
import { type BridgeSearch, searchBridgeOperations } from "./providers/bridge"
import { type ClaimableLock, loadClaimable } from "./providers/claims"
import { type TroveSnapshot, loadTrove } from "./providers/loans"
import { type PriceSnapshot, loadPrices } from "./providers/prices"
import {
  type GaugeProfileName,
  fetchGaugeProfileNames,
} from "./providers/profiles"
import { mezoMainnet } from "./providers/rpc"
import {
  type CallToSimulate,
  type SimulatedCall,
  simulateSequence,
  simulateSingle,
} from "./providers/simulate"
import {
  type LockVoteState,
  type VotingDomain,
  type WalletLock,
  loadFundedEpochs,
  loadLockVoteState,
  loadVotingDomain,
  loadWalletLocks,
} from "./providers/voting"
import {
  type TokenPosition,
  type ZapMarket,
  type ZapQuote,
  type ZapRoute,
  loadTokenPosition,
  loadZapMarket,
  loadZapQuote,
} from "./providers/zap"

// Everything a Stuart tool may read. Live implementations hit Mezo RPC,
// the price oracles, Supabase profile names and Wormholescan; tests pass
// fixtures. Tools never touch the network directly.
export type StuartProviders = {
  prices: () => Promise<PriceSnapshot>
  votingDomain: (branch: VoteBranch) => Promise<VotingDomain>
  walletLocks: (
    owner: Address,
    asset: "veMEZO" | "veBTC",
  ) => Promise<WalletLock[]>
  lockVoteState: (
    branch: VoteBranch,
    tokenIds: readonly bigint[],
    targets: readonly Address[],
  ) => Promise<LockVoteState[]>
  fundedEpochs: (
    domain: VotingDomain,
    window: number,
  ) => Promise<Map<string, number>>
  claimable: (
    domain: VotingDomain,
    locks: readonly WalletLock[],
  ) => Promise<ClaimableLock[]>
  trove: (owner: Address) => Promise<TroveSnapshot>
  zapMarket: (route: ZapRoute) => Promise<ZapMarket>
  zapQuote: (route: ZapRoute, amountIn: bigint) => Promise<ZapQuote>
  tokenPosition: (
    token: Address,
    owner: Address,
    spender: Address,
  ) => Promise<TokenPosition>
  simulateSingle: (
    from: Address,
    call: CallToSimulate,
  ) => Promise<SimulatedCall>
  simulateSequence: (
    from: Address,
    calls: readonly CallToSimulate[],
  ) => Promise<SimulatedCall[]>
  bridge: (
    address: Address,
    limit: number,
    direction: "in" | "out" | null,
  ) => Promise<BridgeSearch>
  boostState: (tokenId: bigint | null) => Promise<BoostState>
  // Boost gauges only: the history worker's per-epoch rows, newest first.
  gaugeHistory: (
    gauge: Address,
    count: number,
    boostTokenId: bigint | null,
  ) => Promise<WireGaugeEpochs>
  // veMEZO voting-incentive earnings from the history worker (exact bribe
  // checkpoint math): this epoch projected, sealed epochs, claimable.
  walletEarnings: (owner: Address) => Promise<WireEarnings>
}

export type StuartWallet = {
  address: Address
  mode: WalletMode
  label: string
}

export type StuartContext = {
  providers: StuartProviders
  wallet: StuartWallet
  query: string
  // The option picked on an entity-disambiguation card, re-validated by the
  // tool against its own candidates.
  choice: string | null
  now: () => Date
  secret: string
}

class RequestMemo<T> {
  private readonly entries = new Map<string, Promise<T>>()

  get(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key)
    if (existing) return existing
    const promise = load()
    this.entries.set(key, promise)
    promise.catch(() => this.entries.delete(key))
    return promise
  }
}

/** Live providers with per-request memoization of the expensive reads. */
export function createLiveProviders(input: {
  baseRpcUrl?: string
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  nowSeconds: () => bigint
}): StuartProviders {
  const client = mezoMainnet()
  const domains = new RequestMemo<VotingDomain>()
  const priceMemo = new RequestMemo<PriceSnapshot>()
  const profileMemo = new RequestMemo<Map<string, GaugeProfileName>>()
  const lockMemo = new RequestMemo<WalletLock[]>()
  const troveMemo = new RequestMemo<TroveSnapshot>()
  const profiles = () =>
    profileMemo.get("profiles", () =>
      fetchGaugeProfileNames({
        supabaseUrl: input.supabaseUrl,
        anonKey: input.supabaseAnonKey,
      }).catch(() => new Map()),
    )
  return {
    prices: () => priceMemo.get("prices", () => loadPrices(input.baseRpcUrl)),
    votingDomain: (branch) =>
      domains.get(`domain:${branch}`, () =>
        loadVotingDomain({
          client,
          branch,
          nowSeconds: input.nowSeconds(),
          profiles,
        }),
      ),
    walletLocks: (owner, asset) =>
      lockMemo.get(`locks:${asset}:${owner.toLowerCase()}`, () =>
        loadWalletLocks(client, owner, asset),
      ),
    lockVoteState: (branch, tokenIds, targets) =>
      loadLockVoteState({ client, branch, tokenIds, targets }),
    fundedEpochs: (domain, window) =>
      loadFundedEpochs({ client, domain, window }),
    claimable: (domain, locks) => loadClaimable({ client, domain, locks }),
    trove: (owner) =>
      troveMemo.get(`trove:${owner.toLowerCase()}`, () =>
        loadTrove(client, owner),
      ),
    zapMarket: (route) => loadZapMarket(client, route),
    zapQuote: (route, amountIn) => loadZapQuote(client, route, amountIn),
    tokenPosition: (token, owner, spender) =>
      loadTokenPosition(client, token, owner, spender),
    simulateSingle: (from, call) => simulateSingle(client, from, call),
    simulateSequence: (from, calls) => simulateSequence(client, from, calls),
    bridge: (address, limit, direction) =>
      searchBridgeOperations({ address, limit, direction }),
    boostState: (tokenId) => loadBoostState(client, tokenId),
    gaugeHistory: (gauge, count, boostTokenId) =>
      gaugeEpochs({
        // The history worker keys boost gauges by lowercase address.
        gauge: `0x${gauge.slice(2).toLowerCase()}`,
        count,
        boostTokenId: boostTokenId ?? undefined,
        now: input.nowSeconds(),
        env: { BASE_RPC_URL: input.baseRpcUrl },
      }),
    walletEarnings: (owner) =>
      walletEarnings(
        owner,
        [],
        8,
        { BASE_RPC_URL: input.baseRpcUrl },
        (promise) => {
          // No ExecutionContext here; the memo refresh just runs to completion.
          promise.catch(() => undefined)
        },
      ),
  }
}
