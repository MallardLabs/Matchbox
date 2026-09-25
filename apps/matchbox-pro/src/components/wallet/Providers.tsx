import { NetworkProvider } from "@/lib/network"
import { mezoMainnet, wagmiConfig } from "@/lib/wallet/config"
import { RainbowKitProvider } from "@rainbow-me/rainbowkit"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactElement, ReactNode } from "react"
import { WagmiProvider } from "wagmi"
import "@rainbow-me/rainbowkit/styles.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

export default function WalletProviders({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <NetworkProvider>
          <RainbowKitProvider initialChain={mezoMainnet}>
            {children}
          </RainbowKitProvider>
        </NetworkProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
