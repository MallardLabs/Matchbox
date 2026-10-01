import MobileNav from "@/components/shell/MobileNav"
import PreviewBanner from "@/components/shell/PreviewBanner"
import SearchPalette from "@/components/shell/SearchPalette"
import Sidebar from "@/components/shell/Sidebar"
import TopBar from "@/components/shell/TopBar"
import ConnectModal from "@/components/wallet/ConnectModal"
import { WalletDialogProvider } from "@/components/wallet/WalletDialogContext"
import { type BoostGauge, useBoostGauges } from "@/hooks/useBoostGauges"
import { profileForGauge, useGaugeProfiles } from "@/hooks/useProfiles"
import { dismissPreviewBanner, isPreviewBannerDismissed } from "@/lib/banner"
import type { SearchHit } from "@/lib/search"
import type { GaugeProfile } from "@/lib/supabase"
import { type ThemeMode, applyTheme, readStoredTheme } from "@/lib/theme"
import { Outlet, createRootRoute } from "@tanstack/react-router"
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"

export const Route = createRootRoute({
  component: AppShell,
})

function AppShell(): ReactElement {
  const [theme, setTheme] = useState<ThemeMode>("light")
  const [collapsed, setCollapsed] = useState(false)
  const tablet = useMediaQuery("(max-width: 1279px)")
  const [bannerOpen, setBannerOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const { gauges } = useBoostGauges()
  const { data: profiles } = useGaugeProfiles()
  const extraHits = useMemo(
    () => gaugeSearchHits(gauges, profiles),
    [gauges, profiles],
  )

  useEffect(() => {
    const stored = readStoredTheme()
    setTheme(stored)
    applyTheme(stored)
    setBannerOpen(!isPreviewBannerDismissed())
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  function handleTheme(next: ThemeMode): void {
    setTheme(next)
    applyTheme(next)
  }

  const openConnect = useCallback(() => setConnectOpen(true), [])

  return (
    <WalletDialogProvider onOpenConnect={openConnect}>
      <div className="flex min-h-dvh bg-canvas">
        <Sidebar
          collapsed={collapsed || tablet}
          canToggle={!tablet}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          theme={theme}
          onThemeChange={handleTheme}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            collapsed={collapsed || tablet}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenConnect={openConnect}
          />
          {bannerOpen ? (
            <PreviewBanner
              onDismiss={() => {
                dismissPreviewBanner()
                setBannerOpen(false)
              }}
            />
          ) : null}
          <main className="min-w-0 flex-1 overflow-x-clip px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-7">
            <Outlet />
          </main>
        </div>
        <MobileNav />
        <SearchPalette
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onConnect={openConnect}
          extraHits={extraHits}
        />
        <ConnectModal open={connectOpen} onOpenChange={setConnectOpen} />
      </div>
    </WalletDialogProvider>
  )
}

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    const media = window.matchMedia(query)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }
}

function useMediaQuery(query: string): boolean {
  const subscribe = useMemo(() => subscribeMedia(query), [query])
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

function gaugeSearchHits(
  gauges: BoostGauge[],
  profiles: GaugeProfile[] | undefined,
): SearchHit[] {
  return gauges.map((gauge) => {
    const profile = profileForGauge(profiles, gauge.address)
    const tokenId = profile?.vebtc_token_id
    const hit: SearchHit = {
      id: gauge.address,
      group: "Gauges",
      label: profile?.display_name || `Gauge ${gauge.address.slice(0, 6)}`,
      to: `/gauges/${gauge.address}`,
    }
    if (tokenId) hit.detail = `#${tokenId}`
    return hit
  })
}
