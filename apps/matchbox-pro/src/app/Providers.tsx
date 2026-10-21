import { NetworkProvider } from "@/lib/network"
import { ViewerProvider } from "@/lib/viewer"
import { mezoMainnet, wagmiConfig } from "@/lib/wallet/config"
import { RainbowKitProvider } from "@rainbow-me/rainbowkit"
import { ThemeProvider } from "@repo/ui/theme"
import * as Toast from "@repo/ui/toast"
import * as Tooltip from "@repo/ui/tooltip"
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

export default function Providers({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <NetworkProvider>
            <ViewerProvider>
              <RainbowKitProvider initialChain={mezoMainnet}>
                <Tooltip.Provider delayDuration={200}>
                  <Toast.Provider viewportClassName="bottom-[84px] md:bottom-6">
                    {children}
                  </Toast.Provider>
                </Tooltip.Provider>
              </RainbowKitProvider>
            </ViewerProvider>
          </NetworkProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  )
}
