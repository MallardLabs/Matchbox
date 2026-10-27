import {
  type MezoChainId,
  networkForChainId,
  networkNames,
} from "@repo/platform-contracts/network"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import { shortenAddress } from "@repo/ui/wallet-address"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Check, PenLine, Wallet } from "lucide-react"
import { type ReactElement, type ReactNode, useEffect, useRef } from "react"
import { useAccount, useSwitchChain } from "wagmi"
import AppMark from "../components/AppMark"
import Identicon from "../components/Identicon"
import NetworkChip from "../components/NetworkChip"
import WalletBoundary from "../components/wallet/WalletBoundary"
import { useWalletDialog } from "../components/wallet/WalletDialogContext"
import { isApiError } from "../lib/api"
import { usePageTitle } from "../lib/page-title"
import { useAuthorizationRequestSummary, useSession } from "../lib/queries"
import { authorizationRequestIdOf, safeReturnPath } from "../lib/return-path"
import { signInSearchSchema } from "../lib/search"
import { signInChainId, useSiweSignIn } from "../lib/siwe"
import { isUserRejection } from "../lib/wallet-errors"
import { walletName } from "../lib/wallet/wallets"

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

function chainName(chainId: MezoChainId): string {
  const network = networkForChainId(chainId)
  return network === null ? String(chainId) : networkNames[network]
}

type StepState = "done" | "active" | "pending"

function StepMark({
  state,
  number,
}: {
  state: StepState
  number: number
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-700 tabular-nums",
        state === "done" && "bg-pos-soft text-pos",
        state === "active" && "bg-ink text-canvas",
        state === "pending" && "bg-inset-2 text-muted",
      )}
    >
      {state === "done" ? <Check size={13} strokeWidth={2.25} /> : number}
    </span>
  )
}

function Step({
  number,
  title,
  state,
  action,
  children,
}: {
  number: number
  title: string
  state: StepState
  action?: ReactNode
  children?: ReactNode
}): ReactElement {
  return (
    <li className="flex flex-col gap-3 border-t border-line py-4 last:border-b">
      <div className="flex min-h-7 items-center gap-3">
        <StepMark state={state} number={number} />
        <h2
          className={cn(
            "text-nav font-600",
            state === "pending" ? "text-secondary" : "text-ink",
          )}
        >
          {title}
          {state === "done" ? <span className="sr-only"> (done)</span> : null}
        </h2>
        {action === undefined ? null : <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </li>
  )
}

function ContinueTo({ requestId }: { requestId: string }): ReactElement | null {
  const summary = useAuthorizationRequestSummary(requestId)
  if (summary.data === undefined) return null
  const { app } = summary.data
  return (
    <p className="flex min-w-0 items-center gap-2.5 pb-4 text-body-sm">
      <AppMark name={app.name} logoUrl={app.logoUrl} size="sm" />
      <span className="text-secondary">Continue to</span>
      <span className="truncate font-600 text-ink">{app.name}</span>
    </p>
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
  const requestId = authorizationRequestIdOf(safeReturnPath(search.return))
  const force = search.force === true || target !== undefined
  const router = useRouter()
  const session = useSession()
  const { address, chainId, connector, isConnected } = useAccount()
  const { openConnect } = useWalletDialog()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { preview, signIn } = useSiweSignIn(target)
  const required = signInChainId(target)

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

  const supported = chainId === required
  const walletReady = isConnected && address !== undefined && supported
  const errorText = signInErrorText(signIn.error)

  // Move the wallet to the sign-in chain as soon as it connects; the button
  // below is for a declined or failed switch.
  const wrongChain =
    isConnected && address !== undefined && !supported
      ? `${address}:${chainId}`
      : null
  const switchedFor = useRef<string | null>(null)
  useEffect(() => {
    if (wrongChain === null || switchedFor.current === wrongChain) return
    switchedFor.current = wrongChain
    switchChain({ chainId: required })
  }, [wrongChain, required, switchChain])

  return (
    <section
      aria-labelledby="sign-in-title"
      className="mx-auto flex w-full max-w-[492px] flex-1 flex-col px-4 pb-10 pt-6 md:justify-center md:py-12"
    >
      {requestId === null ? null : <ContinueTo requestId={requestId} />}
      <h1
        id="sign-in-title"
        className="text-[26px] font-600 leading-[32px] text-ink md:text-[30px] md:leading-[36px]"
      >
        {title}
      </h1>
      <ol className="m-0 mt-5 flex list-none flex-col p-0">
        <Step
          number={1}
          title="Wallet"
          state={walletReady ? "done" : "active"}
          action={
            isConnected ? (
              <Button.Root variant="ghost" size="sm" onClick={openConnect}>
                Change
              </Button.Root>
            ) : undefined
          }
        >
          {isConnected && address !== undefined ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2.5 pl-9">
              <Identicon address={address} size={18} />
              <span
                title={address}
                className="font-mono text-body-sm font-500 text-ink"
              >
                {shortenAddress(address)}
              </span>
              {connector === undefined ? null : (
                <Badge.Root className="font-600">
                  {walletName(connector)}
                </Badge.Root>
              )}
              <span className="ml-auto">
                <NetworkChip chainId={chainId} />
              </span>
            </div>
          ) : (
            <div className="md:pl-9">
              <Button.Root
                size="lg"
                className="h-11 w-full text-body"
                onClick={openConnect}
              >
                <Wallet aria-hidden="true" size={16} strokeWidth={1.75} />
                Connect wallet
              </Button.Root>
            </div>
          )}
          {isConnected && !supported ? (
            <div className="flex flex-wrap items-center gap-2 md:pl-9">
              <span className="text-body-sm font-600 text-warn">
                Wrong network
              </span>
              <Button.Root
                variant="secondary"
                size="sm"
                className="ml-auto"
                loading={switching}
                onClick={() => switchChain({ chainId: required })}
              >
                Switch to {chainName(required)}
              </Button.Root>
            </div>
          ) : null}
        </Step>

        <Step
          number={2}
          title="Sign message"
          state={walletReady ? "active" : "pending"}
        >
          {walletReady ? (
            <div className="flex flex-col gap-3 md:pl-9">
              {sessionWallet !== null &&
              connected !== null &&
              (connected !== sessionWallet || force) ? (
                <p className="flex flex-wrap items-center gap-2 text-label text-secondary">
                  Signed in
                  <span className="font-mono text-ink-2">
                    {shortenAddress(sessionWallet)}
                  </span>
                </p>
              ) : null}
              <Button.Root
                size="lg"
                className="h-11 w-full text-body"
                disabled={preview.isError}
                loading={signIn.isPending}
                onClick={() =>
                  signIn.mutate(undefined, {
                    onSuccess: () => router.history.replace(returnTo),
                  })
                }
              >
                {signIn.isPending ? null : (
                  <PenLine aria-hidden="true" size={15} strokeWidth={1.75} />
                )}
                {signIn.isPending ? "Check wallet" : "Sign message"}
              </Button.Root>
              {preview.isError ? (
                <p role="alert" className="text-body-sm text-neg">
                  {isApiError(preview.error, "rate_limited")
                    ? "Too many attempts"
                    : "Message unavailable"}
                </p>
              ) : null}
              {errorText === null ? null : (
                <p role="alert" className="text-body-sm text-neg">
                  {errorText}
                </p>
              )}
            </div>
          ) : null}
        </Step>
      </ol>
    </section>
  )
}
