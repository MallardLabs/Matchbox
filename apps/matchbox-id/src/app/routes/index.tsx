import type { IdentityAccount } from "@repo/platform-contracts/identity"
import { chainIdByNetwork } from "@repo/platform-contracts/network"
import * as Button from "@repo/ui/button"
import * as Card from "@repo/ui/card"
import * as KeyValue from "@repo/ui/key-value"
import * as PageHeader from "@repo/ui/page-header"
import * as WalletAddress from "@repo/ui/wallet-address"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { useAccount } from "wagmi"
import ConnectedApps from "../components/ConnectedApps"
import DeviceSessions from "../components/DeviceSessions"
import DiscordSummary from "../components/DiscordSummary"
import NetworkLabel from "../components/NetworkLabel"
import PageSkeleton from "../components/PageSkeleton"
import WalletBoundary from "../components/wallet/WalletBoundary"
import { usePageTitle } from "../lib/page-title"
import { useSignOut } from "../lib/queries"
import { useRequiredAccount } from "../lib/use-required-account"

export const Route = createFileRoute("/")({
  component: AccountRoute,
})

/** The wallet stack loads only on the pages that need it. */
function AccountRoute(): ReactElement {
  return (
    <WalletBoundary>
      <AccountPage />
    </WalletBoundary>
  )
}

function AccountSummary({
  account,
}: {
  account: IdentityAccount
}): ReactElement {
  const wallet = useAccount()
  const connectedHere =
    wallet.address !== undefined &&
    wallet.address.toLowerCase() === account.walletAddress
  return (
    <Card.Root variant="panel">
      <Card.Header>
        <Card.Title>Wallet</Card.Title>
      </Card.Header>
      <Card.Body>
        <KeyValue.Root>
          <KeyValue.Item>
            <KeyValue.Term>Address</KeyValue.Term>
            <KeyValue.Value>
              <WalletAddress.Root address={account.walletAddress} />
            </KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Network</KeyValue.Term>
            <KeyValue.Value>
              <NetworkLabel
                chainId={
                  connectedHere
                    ? wallet.chainId
                    : account.signedInNetwork === null
                      ? undefined
                      : chainIdByNetwork[account.signedInNetwork]
                }
              />
            </KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Discord</KeyValue.Term>
            <KeyValue.Value>
              <DiscordSummary discord={account.discord} />
            </KeyValue.Value>
          </KeyValue.Item>
        </KeyValue.Root>
      </Card.Body>
    </Card.Root>
  )
}

function AccountPage(): ReactElement {
  usePageTitle("Account")
  const account = useRequiredAccount("/")
  const signOut = useSignOut()
  const navigate = useNavigate()
  if (account === null) return <PageSkeleton />
  return (
    <div className="flex flex-col gap-6">
      <PageHeader.Root>
        <PageHeader.Heading>
          <PageHeader.Title>Account</PageHeader.Title>
        </PageHeader.Heading>
        <PageHeader.Actions>
          <Button.Root
            variant="secondary"
            loading={signOut.isPending}
            onClick={() =>
              signOut.mutate(undefined, {
                onSuccess: () =>
                  void navigate({ to: "/sign-in", search: { force: false } }),
              })
            }
          >
            Sign out
          </Button.Root>
        </PageHeader.Actions>
      </PageHeader.Root>
      <AccountSummary account={account} />
      <ConnectedApps />
      <DeviceSessions />
    </div>
  )
}
