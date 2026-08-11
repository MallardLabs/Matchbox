import type { AppProps } from "next/app"
import "@rainbow-me/rainbowkit/styles.css"
import "@fontsource/ibm-plex-mono/400.css"
import "@fontsource/ibm-plex-mono/500.css"
import "@fontsource/ibm-plex-sans/400.css"
import "@fontsource/ibm-plex-sans/500.css"
import "@fontsource/ibm-plex-sans/600.css"
import "@/styles/globals.css"
import { WalletProviders } from "@/components/wallet/WalletProviders"

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WalletProviders>
      <Component {...pageProps} />
    </WalletProviders>
  )
}
