import { getAddress, parseAbi } from "viem"

// Exact signatures, verified against the deployed contracts (see
// docs research specs: musd-loans-zaps, vote-validators-pools).

export const VOTER_ABI = parseAbi([
  "function length() view returns (uint256)",
  "function gauges(uint256) view returns (address)",
  "function pools(uint256) view returns (address)",
  "function weights(address) view returns (uint256)",
  "function totalWeight() view returns (uint256)",
  "function isAlive(address) view returns (bool)",
  "function gaugeToBribe(address) view returns (address)",
  "function gaugeToFees(address) view returns (address)",
  "function votes(uint256, address) view returns (uint256)",
  "function lastVoted(uint256) view returns (uint256)",
  "function usedWeights(uint256) view returns (uint256)",
  "function epochStart(uint256) view returns (uint256)",
  "function epochNext(uint256) view returns (uint256)",
  "function vote(uint256 tokenId, address[] targets, uint256[] weights)",
  "function claimBribes(address[] bribes, address[][] tokens, uint256 tokenId)",
  "function claimFeesAndBribes(address[] rewards, address[][] tokens, uint256 tokenId)",
])

// PoolsVoter maps a pool or vault to its gauge with an overload of `gauges`.
export const POOLS_VOTER_GAUGE_ABI = parseAbi([
  "function gauges(address) view returns (address)",
])

export const BOOST_ABI = parseAbi([
  "function getBoost(uint256 boostableTokenId) view returns (uint256)",
  "function unboostedVotingPowerOfNFT(uint256) view returns (uint256)",
  "function unboostedTotalVotingPower() view returns (uint256)",
  "function totalVotingPower() view returns (uint256)",
])

export const REWARD_ABI = parseAbi([
  "function rewardsListLength() view returns (uint256)",
  "function rewards(uint256) view returns (address)",
  "function tokenRewardsPerEpoch(address token, uint256 epochStart) view returns (uint256)",
  "function earned(address token, uint256 tokenId) view returns (uint256)",
])

export const ESCROW_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function ownerToNFTokenIdList(address, uint256) view returns (uint256)",
  "function votingPowerOfNFT(uint256) view returns (uint256)",
  "function locked(uint256) view returns ((int128 amount, uint256 end, bool isPermanent, uint256 boost))",
])

export const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
])

export const VALIDATOR_POOL_ABI = parseAbi([
  "function validators() view returns (address[])",
  "function validator(address operator) view returns (bytes32 consPubKey, (string moniker, string identity, string website, string securityContact, string details) description)",
])

export const VALIDATORS_VOTER_EXTRA_ABI = parseAbi([
  "function validatorToGauge(address) view returns (address)",
])

export const TROVE_MANAGER_ABI = parseAbi([
  "function getEntireDebtAndColl(address _borrower) view returns (uint256 coll, uint256 principal, uint256 interest, uint256 pendingCollateral, uint256 pendingPrincipal, uint256 pendingInterest)",
  "function getTroveStatus(address _borrower) view returns (uint8)",
  "function getCurrentICR(address _borrower, uint256 _price) view returns (uint256)",
  "function getTroveInterestRate(address _borrower) view returns (uint16)",
  "function getTCR(uint256 _price) view returns (uint256)",
  "function checkRecoveryMode(uint256 _price) view returns (bool)",
  "function MCR() view returns (uint256)",
  "function CCR() view returns (uint256)",
  "function MUSD_GAS_COMPENSATION() view returns (uint256)",
])

export const PRICE_FEED_ABI = parseAbi([
  "function fetchPrice() view returns (uint256)",
])

export const BORROWER_OPERATIONS_ABI = parseAbi([
  "function minNetDebt() view returns (uint256)",
  "function repayMUSD(uint256 _amount, address _upperHint, address _lowerHint)",
  "function claimCollateral()",
])

export const COLL_SURPLUS_ABI = parseAbi([
  "function getCollateral(address _account) view returns (uint256)",
])

export const CL_POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
  "function fee() view returns (uint24)",
])

export const QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, int24 tickSpacing, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
])

export const SWAP_ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, int24 tickSpacing, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
])

export const SAVINGS_ABI = parseAbi(["function deposit(uint256 amount)"])

export const SKIP_ORACLE_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
])

// Mezo mainnet (31612). Stuart v1 prepares mainnet proposals only.
export const MAINNET = {
  boostVoter: getAddress("0x2Ba614a598Cffa5a19d683cDCA97bac3a49313d1"),
  poolsVoter: getAddress("0x48233cCC97B87Ba93bCA212cbEe48e3210211f03"),
  validatorsVoter: getAddress("0xe99a9ad5Ed26BD30e4DB25397f378817e9b9515a"),
  validatorPool: getAddress("0x7B7C000000000000000000000000000000000011"),
  veMEZO: getAddress("0xb90fdAd3DFD180458D62Cc6acedc983D78E20122"),
  veBTC: getAddress("0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279"),
  mezo: getAddress("0x7B7c000000000000000000000000000000000001"),
  musd: getAddress("0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186"),
  borrowerOperations: getAddress("0x44b1bac67dDA612a41a58AAf779143B181dEe031"),
  troveManager: getAddress("0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193"),
  priceFeed: getAddress("0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88"),
  skipOracle: getAddress("0x7b7c000000000000000000000000000000000015"),
  collSurplusPool: getAddress("0xBF51807ACb3394B8550f0554FB9098856Ef5F491"),
  musdSavings: getAddress("0xb4D498029af77680cD1eF828b967f010d06C51CC"),
  clSwapRouter: getAddress("0x37cDd11919ec3860eaD9efB8673d7476E5326225"),
  clQuoter: getAddress("0x4E56aF2d49D3D8F9a99155b31dd117ccDD545dC7"),
  clPoolMezoMusd200: getAddress("0x1D6e8D24c133535F2d00676F66a0e824f84765ff"),
} as const

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
