import * as Tabs from "@repo/ui/tabs"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type { ReactElement } from "react"
import PageSkeleton from "../components/PageSkeleton"
import ConnectedApps from "../components/account/ConnectedApps"
import DeviceSessions from "../components/account/DeviceSessions"
import IdentityStrip from "../components/account/IdentityStrip"
import { usePageTitle } from "../lib/page-title"
import { accountSearchSchema } from "../lib/search"
import { useRequiredAccount } from "../lib/use-required-account"

export const Route = createFileRoute("/")({
  validateSearch: accountSearchSchema,
  component: AccountPage,
})

type AccountTab = "apps" | "sessions"

function isAccountTab(value: string): value is AccountTab {
  return value === "apps" || value === "sessions"
}

function AccountPage(): ReactElement {
  const { tab: requested } = Route.useSearch()
  const tab: AccountTab = requested ?? "apps"
  const title = tab === "sessions" ? "Sessions" : "Connected apps"
  usePageTitle(title)
  const account = useRequiredAccount(
    tab === "sessions" ? "/?tab=sessions" : "/",
  )
  const navigate = useNavigate()
  if (account === null) return <PageSkeleton />
  return (
    <div className="mx-auto flex w-full max-w-[1008px] flex-col gap-6 px-4 pb-12 pt-6 md:px-6 md:pt-9">
      <header className="flex flex-col gap-1.5">
        <p className="text-label text-secondary">Account</p>
        <h1 className="text-title font-600 text-ink">{title}</h1>
      </header>
      <IdentityStrip account={account} />
      <Tabs.Root
        value={tab}
        onValueChange={(value) => {
          if (!isAccountTab(value)) return
          void navigate({
            to: "/",
            search: value === "sessions" ? { tab: "sessions" } : {},
            replace: true,
          })
        }}
      >
        <Tabs.List aria-label="Account">
          <Tabs.Trigger value="apps">Connected apps</Tabs.Trigger>
          <Tabs.Trigger value="sessions">Sessions</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="apps">
          <ConnectedApps />
        </Tabs.Content>
        <Tabs.Content value="sessions">
          <DeviceSessions />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
