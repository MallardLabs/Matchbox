import { chainIdByNetwork } from "@repo/platform-contracts/network"
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createSiweMessage } from "viem/siwe"
import { useAccount, useSignMessage } from "wagmi"
import type { SiweVerifyViewResponse } from "../../shared/contracts"
import { api } from "./api"
import { queryKeys } from "./queries"

export const signInStatement = "Sign in to Matchbox ID."

const messageLifetimeMs = 5 * 60_000
/** The previewed message is re-issued well before it expires. */
const previewLifetimeMs = 4 * 60_000

export function isSignInChain(chainId: number | undefined): boolean {
  return (
    chainId === chainIdByNetwork.mezo ||
    chainId === chainIdByNetwork["mezo-testnet"]
  )
}

/** The exact EIP-4361 message the wallet is asked to sign. */
export type SiwePreview = {
  message: string
  issuedAt: Date
}

const siweMessageKey = ["siwe-message"] as const

function isFresh(preview: SiwePreview): boolean {
  return Date.now() - preview.issuedAt.getTime() < previewLifetimeMs
}

export type SiweSignIn = {
  /** Present once a wallet on a supported chain is connected. */
  preview: UseQueryResult<SiwePreview, Error>
  signIn: UseMutationResult<SiweVerifyViewResponse, Error, void>
}

/**
 * EIP-4361 sign-in: nonce → wallet signature (gasless) → session cookie.
 * The message is built before signing so the page shows what the wallet
 * will sign. With `targetChainId`, the message must name that chain (the
 * wallet has to be on it), so contract accounts are verified on the
 * client's network.
 */
export function useSiweSignIn(targetChainId?: number): SiweSignIn {
  const { address, chainId } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const client = useQueryClient()
  const supported =
    chainId !== undefined &&
    isSignInChain(chainId) &&
    (targetChainId === undefined || chainId === targetChainId)

  const preview = useQuery<SiwePreview, Error>({
    queryKey: [...siweMessageKey, address, chainId],
    enabled: address !== undefined && supported,
    staleTime: previewLifetimeMs,
    refetchInterval: previewLifetimeMs,
    refetchOnWindowFocus: false,
    gcTime: 0,
    queryFn: async () => {
      if (address === undefined || chainId === undefined) {
        throw new Error("Connect a wallet")
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
      return { message, issuedAt }
    },
  })

  const signIn = useMutation<SiweVerifyViewResponse, Error, void>({
    mutationFn: async () => {
      if (address === undefined || chainId === undefined) {
        throw new Error("Connect a wallet")
      }
      if (!supported) throw new Error("Unsupported network")
      let current = preview.data
      if (current === undefined || !isFresh(current)) {
        current = (await preview.refetch()).data
      }
      if (current === undefined) throw new Error("Sign-in failed")
      const signature = await signMessageAsync({
        account: address,
        message: current.message,
      })
      return api.siweVerify({ message: current.message, signature })
    },
    onSuccess: (result) => {
      client.setQueryData(queryKeys.session, { account: result.account })
      client.removeQueries({ queryKey: queryKeys.grants })
      client.removeQueries({ queryKey: queryKeys.sessions })
      client.removeQueries({ queryKey: ["authorization-request"] })
    },
    // A verify attempt consumes the nonce: show a fresh message next time.
    onSettled: () => client.invalidateQueries({ queryKey: siweMessageKey }),
  })

  return { preview, signIn }
}
