import {
  type MezoChainId,
  chainIdByNetwork,
  networkForChainId,
  networkNames,
} from "@repo/platform-contracts/network"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as WalletAddress from "@repo/ui/wallet-address"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { type ReactElement, type ReactNode, useEffect } from "react"
import { useAccount, useSwitchChain } from "wagmi"
import NetworkLabel from "../components/NetworkLabel"
import WalletBoundary from "../components/wallet/WalletBoundary"
import { useWalletDialog } from "../components/wallet/WalletDialogContext"
import { isApiError } from "../lib/api"
import { usePageTitle } from "../lib/page-title"
import { useSession } from "../lib/queries"
import { safeReturnPath } from "../lib/return-path"
import { signInSearchSchema } from "../lib/search"
import { isSignInChain, signInStatement, useSiweSignIn } from "../lib/siwe"
import { isUserRejection } from "../lib/wallet-errors"

export const Route = createFileRoute("/sign-in")({
  validateSearch: signInSearchSchema,
  component: SignInRoute,
})

/** The wallet stack loads only on the pages that need it. */
function SignInRoute(): ReactElement {
  return (
    <WalletBoundary>
      <SignInPage />
    </WalletBoundary>
  )
}

const signInChainIds: readonly MezoChainId[] = [
  chainIdByNetwork.mezo,
  chainIdByNetwork["mezo-testnet"],
]

function chainName(chainId: MezoChainId): string {
  const network = networkForChainId(chainId)
  return network === null ? String(chainId) : networkNames[network]
}

function Step({
  number,
  title,
  done,
  children,
}: {
  number: number
  title: string
  done: boolean
  children: ReactNode
}): ReactElement {
  return (
    <li className="flex gap-3 rounded-[10px] border border-line bg-surface p-4">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-650 tabular-nums",
          done ? "bg-pos/10 text-pos" : "bg-inset text-secondary",
        )}
      >
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h2 className="text-[14px] font-600 text-ink">
          {title}
          {done ? <span className="sr-only"> (done)</span> : null}
        </h2>
        {children}
      </div>
    </li>
  )
}

function signInErrorText(error: Error | null): string | null {
  if (error === null) return null
  if (isUserRejection(error)) return "Signature rejected"
  if (isApiError(error, "rate_limited")) return "Too many attempts"
  if (error.message === "Unsupported network") return "Unsupported network"
  return "Sign-in failed"
}

function SignInPage(): ReactElement {
  const search = Route.useSearch()
  // `chain`: a contract-account session must sign in on the client's network.
  const target = search.chain
  const title =
    target === undefined ? "Sign in" : `Sign in on ${chainName(target)}`
  usePageTitle(title)
  const returnTo = safeReturnPath(search.return) ?? "/"
  const force = search.force === true || target !== undefined
  const router = useRouter()
  const session = useSession()
  const { address, chainId, isConnected } = useAccount()
  const { openConnect } = useWalletDialog()
  const switchChain = useSwitchChain()
  const signIn = useSiweSignIn(target)

  const sessionWallet = session.data?.account?.walletAddress ?? null
  const connected = address?.toLowerCase() ?? null
  const alreadySignedIn =
    sessionWallet !== null &&
    !force &&
    !signIn.isPending &&
    (connected === null || connected === sessionWallet)

  useEffect(() => {
    if (alreadySignedIn) router.history.replace(returnTo)
  }, [alreadySignedIn, returnTo, router])

  const supported =
    target === undefined ? isSignInChain(chainId) : chainId === target
  const switchTargets = target === undefined ? signInChainIds : [target]
  const errorText = signInErrorText(signIn.error)

  return (
    <section
      aria-labelledby="sign-in-title"
      className="mx-auto flex w-full max-w-[440px] flex-col gap-5 py-4 sm:py-10"
    >
      <h1 id="sign-in-title" className="text-[28px] font-600 text-ink">
        {title}
      </h1>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        <Step number={1} title="Wallet" done={isConnected && supported}>
          {isConnected && address !== undefined ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
                <WalletAddress.Root address={address} copyable={false} />
                <NetworkLabel chainId={chainId} />
              </span>
              <Button.Root variant="ghost" size="sm" onClick={openConnect}>
                Change
              </Button.Root>
            </div>
          ) : (
            <Button.Root size="lg" className="w-full" onClick={openConnect}>
              Connect wallet
            </Button.Root>
          )}
        </Step>

        <Step number={2} title="Sign message" done={false}>
          <figure className="m-0 flex flex-col gap-2 rounded-lg bg-inset p-3">
            <blockquote className="m-0 font-mono text-[12px] text-ink-2">
              {signInStatement}
            </blockquote>
            <figcaption className="flex flex-wrap gap-1.5">
              <Badge.Root tone="pos">Gasless</Badge.Root>
              <Badge.Root>No transaction</Badge.Root>
              <Badge.Root mono>EIP-4361</Badge.Root>
            </figcaption>
          </figure>

          {isConnected && !supported ? (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 text-[13px] font-600 text-warn">
                {target === undefined
                  ? "Unsupported network"
                  : `Switch to ${chainName(target)}`}
              </legend>
              <div className="flex flex-wrap gap-2">
                {switchTargets.map((switchTo) => (
                  <Button.Root
                    key={switchTo}
                    variant="secondary"
                    size="sm"
                    loading={
                      switchChain.isPending &&
                      switchChain.variables?.chainId === switchTo
                    }
                    onClick={() =>
                      switchChain.switchChain({ chainId: switchTo })
                    }
                  >
                    {chainName(switchTo)}
                  </Button.Root>
                ))}
              </div>
            </fieldset>
          ) : null}

          {sessionWallet !== null &&
          connected !== null &&
          (connected !== sessionWallet || force) ? (
            <p className="flex flex-wrap items-center gap-2 text-[12px] text-secondary">
              Signed in
              <WalletAddress.Root address={sessionWallet} copyable={false} />
            </p>
          ) : null}

          <Button.Root
            size="lg"
            className="w-full"
            disabled={!isConnected || !supported}
            loading={signIn.isPending}
            onClick={() =>
              signIn.mutate(undefined, {
                onSuccess: () => router.history.replace(returnTo),
              })
            }
          >
            {signIn.isPending ? "Check wallet" : "Sign message"}
          </Button.Root>
          {errorText === null ? null : (
            <p role="alert" className="text-[13px] text-neg">
              {errorText}
            </p>
          )}
        </Step>
      </ol>
    </section>
  )
}
