import { ConnectDialogProvider, useConnectDialog } from "@/app/ConnectDialog"
import MobileNav from "@/app/MobileNav"
import ShellBanner from "@/app/ShellBanner"
import Sidebar from "@/app/Sidebar"
import TopBar from "@/app/TopBar"
import { WalletDialogProvider } from "@/components/wallet/WalletDialogContext"
import { SearchPaletteProvider } from "@/features/query/SearchPalette"
import StuartWorkspace from "@/features/query/StuartWorkspace"
import { DESKTOP_QUERY, useMediaQuery } from "@/hooks/useMediaQuery"
import * as AppShell from "@repo/ui/app-shell"
import { Outlet, createRootRoute, useRouterState } from "@tanstack/react-router"
import { type ReactElement, type ReactNode, useEffect, useState } from "react"

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
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [userCollapsed, setUserCollapsed] = useState(false)
  // Tablet keeps the rail; expanding opens the full sidebar over the page.
  const [tabletOpen, setTabletOpen] = useState(false)
  const overlay = !desktop && tabletOpen
  const collapsed = desktop ? userCollapsed : !tabletOpen

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the overlay whenever the route changes
  useEffect(() => {
    setTabletOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!overlay) return
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setTabletOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [overlay])

  return (
    <AppShell.Root className="overflow-x-clip">
      <AppShell.SkipLink />
      {overlay ? (
        <>
          <div
            aria-hidden="true"
            className="hidden w-[72px] shrink-0 md:block"
          />
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setTabletOpen(false)}
            className="fixed inset-0 z-overlay cursor-default bg-scrim"
          />
        </>
      ) : null}
      <Sidebar
        collapsed={collapsed}
        canToggle
        overlay={overlay}
        onToggleCollapse={() =>
          desktop
            ? setUserCollapsed((value) => !value)
            : setTabletOpen((value) => !value)
        }
      />
      <AppShell.Body>
        <TopBar showTicker={collapsed} />
        <ShellBanner />
        <div className="flex min-w-0 flex-1">
          <AppShell.Main>
            <Outlet />
          </AppShell.Main>
          <StuartWorkspace />
        </div>
      </AppShell.Body>
      <MobileNav />
    </AppShell.Root>
  )
}
