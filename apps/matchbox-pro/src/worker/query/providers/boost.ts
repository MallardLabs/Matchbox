import { BOOST_ABI, MAINNET } from "./abis"
import type { MezoClient } from "./rpc"

export type BoostState = {
  // 1e18 = 1×; null when the gauge's veBTC lock can't be read.
  boostWad: bigint | null
  unboostedVotingPower: bigint | null
  veMezoTotal: bigint
  veBtcUnboostedTotal: bigint
  blockNumber: bigint
}

/** Boost inputs for a boost gauge's veBTC lock (Pro's useBoostGauges reads). */
export async function loadBoostState(
  client: MezoClient,
  tokenId: bigint | null,
): Promise<BoostState> {
  const at = { blockNumber: await client.getBlockNumber() }
  const [veMezoTotal, veBtcUnboostedTotal, boostWad, unboosted] =
    await Promise.all([
      client.readContract({
        ...at,
        address: MAINNET.veMEZO,
        abi: BOOST_ABI,
        functionName: "totalVotingPower",
      }),
      client.readContract({
        ...at,
        address: MAINNET.veBTC,
        abi: BOOST_ABI,
        functionName: "unboostedTotalVotingPower",
      }),
      tokenId === null
        ? Promise.resolve(null)
        : client
            .readContract({
              ...at,
              address: MAINNET.boostVoter,
              abi: BOOST_ABI,
              functionName: "getBoost",
              args: [tokenId],
            })
            .catch(() => null),
      tokenId === null
        ? Promise.resolve(null)
        : client
            .readContract({
              ...at,
              address: MAINNET.veBTC,
              abi: BOOST_ABI,
              functionName: "unboostedVotingPowerOfNFT",
              args: [tokenId],
            })
            .catch(() => null),
    ])
  return {
    boostWad,
    unboostedVotingPower: unboosted,
    veMezoTotal,
    veBtcUnboostedTotal,
    blockNumber: at.blockNumber,
  }
}
