import "@fontsource/ibm-plex-mono/400.css"
import "@fontsource/ibm-plex-mono/600.css"
import "@fontsource/ibm-plex-sans/400.css"
import "@fontsource/ibm-plex-sans/500.css"
import "@fontsource/ibm-plex-sans/600.css"
import "@rainbow-me/rainbowkit/styles.css"
import "@scalar/api-reference-react/style.css"
import "@/styles/globals.css"
import { wagmiConfig } from "@/config/wagmi"
import { RainbowKitProvider } from "@rainbow-me/rainbowkit"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { AppProps } from "next/app"
import { useState } from "react"
import { WagmiProvider } from "wagmi"

export default function App({ Component, pageProps }: AppProps): JSX.Element {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <Component {...pageProps} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
