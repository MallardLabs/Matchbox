import { wagmiConfig } from "@/config/wagmi"
import {
  ThemeProvider,
  getThemeObject,
  useTheme,
} from "@/contexts/ThemeContext"
import { ClayProvider } from "@mezo-org/mezo-clay"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { AppProps } from "next/app"
import { WagmiProvider } from "wagmi"

const queryClient = new QueryClient()

type ClientAppProps = Pick<AppProps, "Component" | "pageProps">

function ThemedApp({ Component, pageProps }: ClientAppProps) {
  const { theme } = useTheme()
  const themeObject = getThemeObject(theme)

  return (
    <ClayProvider theme={themeObject}>
      <Component {...pageProps} />
    </ClayProvider>
  )
}

export function ClientApp({ Component, pageProps }: ClientAppProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ThemedApp Component={Component} pageProps={pageProps} />
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
