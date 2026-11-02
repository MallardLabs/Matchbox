import useWalletNetworkGate from "@/hooks/useWalletNetworkGate"
import {
  type Config,
  type UseSendTransactionReturnType,
  type UseWriteContractReturnType,
  useSendTransaction,
  useWriteContract,
} from "wagmi"

// A pinned chainId only makes viem compare it with the chain of the client the
// connector builds for that chainId, so the check is as good as the connector.
// OrangeKit (Mezo Passport BTC wallets) builds a client for the requested chain
// but relays through the smart account on its own chain, so a Testnet approve
// went out on Mezo Mainnet. These wrappers run assertWalletNetwork as the
// mutation's onMutate: every signing request first asks the connector for its
// chain, and a mismatch fails the write and surfaces as its `error`.

export function useGatedWriteContract(): UseWriteContractReturnType<
  Config,
  void
> {
  const { assertWalletNetwork } = useWalletNetworkGate()
  return useWriteContract({ mutation: { onMutate: assertWalletNetwork } })
}

export function useGatedSendTransaction(): UseSendTransactionReturnType<
  Config,
  void
> {
  const { assertWalletNetwork } = useWalletNetworkGate()
  return useSendTransaction({ mutation: { onMutate: assertWalletNetwork } })
}
