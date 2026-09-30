import type { SiweVerifyResponse } from "@repo/platform-contracts/identity"
import { chainIdByNetwork } from "@repo/platform-contracts/network"
import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { createSiweMessage } from "viem/siwe"
import { useAccount, useSignMessage } from "wagmi"
import { api } from "./api"
import { queryKeys } from "./queries"

export const signInStatement = "Sign in to Matchbox ID."

const messageLifetimeMs = 5 * 60_000

export function isSignInChain(chainId: number | undefined): boolean {
  return (
    chainId === chainIdByNetwork.mezo ||
    chainId === chainIdByNetwork["mezo-testnet"]
  )
}

/**
 * EIP-4361 sign-in: nonce → wallet signature (gasless) → session cookie.
 * With `targetChainId`, the message must name that chain (the wallet has to
 * be on it), so contract accounts are verified on the client's network.
 */
export function useSiweSignIn(
  targetChainId?: number,
): UseMutationResult<SiweVerifyResponse, Error, void> {
  const { address, chainId } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const client = useQueryClient()
  return useMutation<SiweVerifyResponse, Error, void>({
    mutationFn: async () => {
      if (address === undefined || chainId === undefined) {
        throw new Error("Connect a wallet")
      }
      if (
        !isSignInChain(chainId) ||
        (targetChainId !== undefined && chainId !== targetChainId)
      ) {
        throw new Error("Unsupported network")
      }

      const { nonce } = await api.siweNonce()
      const issuedAt = new Date()
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: signInStatement,
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
        issuedAt,
        expirationTime: new Date(issuedAt.getTime() + messageLifetimeMs),
      })
      const signature = await signMessageAsync({ account: address, message })
      return api.siweVerify({ message, signature })
    },
    onSuccess: (result) => {
      client.setQueryData(queryKeys.session, { account: result.account })
      client.removeQueries({ queryKey: queryKeys.grants })
      client.removeQueries({ queryKey: queryKeys.sessions })
      client.removeQueries({ queryKey: ["authorization-request"] })
    },
  })
}
