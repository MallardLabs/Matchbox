import { ConnectDialogProvider, useConnectDialog } from "@/app/ConnectDialog"
import MobileNav from "@/app/MobileNav"
import ShellBanner from "@/app/ShellBanner"
import Sidebar from "@/app/Sidebar"
import TopBar from "@/app/TopBar"
import { WalletDialogProvider } from "@/components/wallet/WalletDialogContext"
import { SearchPaletteProvider } from "@/features/query/SearchPalette"
import { DESKTOP_QUERY, useMediaQuery } from "@/hooks/useMediaQuery"
import * as AppShell from "@repo/ui/app-shell"
import { Outlet, createRootRoute } from "@tanstack/react-router"
import { type ReactElement, type ReactNode, useState } from "react"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout(): ReactElement {
  return (
    <ConnectDialogProvider>
      <LegacyWalletDialog>
        <SearchPaletteProvider>
          <Shell />
        </SearchPaletteProvider>
      </LegacyWalletDialog>
    </ConnectDialogProvider>
  )
}

// Older feature components still open the connect dialog through this
// context; it forwards to the shell's dialog.
function LegacyWalletDialog({ children }: { children: ReactNode }) {
  const { open } = useConnectDialog()
  return (
    <WalletDialogProvider onOpenConnect={open}>{children}</WalletDialogProvider>
  )
}

function Shell(): ReactElement {
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const [userCollapsed, setUserCollapsed] = useState(false)
  const collapsed = !desktop || userCollapsed

  return (
    <AppShell.Root className="overflow-x-clip">
      <AppShell.SkipLink />
      <Sidebar
        collapsed={collapsed}
        canToggle={desktop}
        onToggleCollapse={() => setUserCollapsed((value) => !value)}
      />
      <AppShell.Body>
        <TopBar showTicker={collapsed} />
        <ShellBanner />
        <AppShell.Main>
          <Outlet />
        </AppShell.Main>
      </AppShell.Body>
      <MobileNav />
    </AppShell.Root>
  )
}
