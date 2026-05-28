import AcademyPanel from "@/components/AcademyPanel"
import PreviewModePanel from "@/components/PreviewModePanel"
import { mezoTestnet, wagmiConfig } from "@/config/wagmi"
import { AcademyProvider } from "@/contexts/AcademyContext"
import { GaugeProfilesProvider } from "@/contexts/GaugeProfilesContext"
import { NetworkProvider } from "@/contexts/NetworkContext"
import { PreviewModeProvider } from "@/contexts/PreviewModeContext"
import {
  ThemeProvider,
  getThemeObject,
  useTheme,
} from "@/contexts/ThemeContext"
import { useAcademyHotkey } from "@/hooks/useAcademyHotkey"
import { usePreviewModeHotkey } from "@/hooks/usePreviewModeHotkey"
import { ClayProvider } from "@mezo-org/mezo-clay"
import { PassportProvider } from "@mezo-org/passport"
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit"
import "@rainbow-me/rainbowkit/styles.css"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { AppProps } from "next/app"
import { WagmiProvider } from "wagmi"
import { Layout } from "./Layout"
import { SunsetBackground } from "./SunsetBackground"

const queryClient = new QueryClient()

type ClientAppProps = Pick<AppProps, "Component" | "pageProps">

function ThemedApp({ Component, pageProps }: ClientAppProps) {
  const { theme } = useTheme()
  const themeObject = getThemeObject(theme)
  usePreviewModeHotkey()
  useAcademyHotkey()

  const rainbowTheme =
    theme === "dark"
      ? darkTheme({
          accentColor: "#F7931A",
          accentColorForeground: "white",
          borderRadius: "medium",
        })
      : lightTheme({
          accentColor: "#F7931A",
          accentColorForeground: "white",
          borderRadius: "medium",
        })

  return (
    <RainbowKitProvider theme={rainbowTheme} initialChain={mezoTestnet}>
      <PassportProvider environment="mainnet">
        <ClayProvider theme={themeObject}>
          <SunsetBackground />
          <Layout>
            <Component {...pageProps} />
          </Layout>
          <PreviewModePanel />
          <AcademyPanel />
        </ClayProvider>
      </PassportProvider>
    </RainbowKitProvider>
  )
}

export function ClientApp({ Component, pageProps }: ClientAppProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <NetworkProvider>
            <PreviewModeProvider>
              <AcademyProvider>
                <GaugeProfilesProvider>
                  <ThemedApp Component={Component} pageProps={pageProps} />
                </GaugeProfilesProvider>
              </AcademyProvider>
            </PreviewModeProvider>
          </NetworkProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
