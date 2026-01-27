import { mezoMainnet, mezoTestnet, wagmiConfig } from "@/config/wagmi"
import { GaugeProfilesProvider } from "@/contexts/GaugeProfilesContext"
import { NetworkProvider } from "@/contexts/NetworkContext"
import {
  ThemeProvider,
  getThemeObject,
  useTheme,
} from "@/contexts/ThemeContext"
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
      <PassportProvider environment="testnet">
        <ClayProvider theme={themeObject}>
          <SunsetBackground />
          <Layout>
            <Component {...pageProps} />
          </Layout>
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
            <GaugeProfilesProvider>
              <ThemedApp Component={Component} pageProps={pageProps} />
            </GaugeProfilesProvider>
          </NetworkProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
