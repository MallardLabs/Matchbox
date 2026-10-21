import { NetworkProvider } from "@/lib/network"
import { ViewerProvider } from "@/lib/viewer"
import { wagmiConfig } from "@/lib/wallet/config"
import { ThemeProvider } from "@repo/ui/theme"
import * as Toast from "@repo/ui/toast"
import * as Tooltip from "@repo/ui/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactElement, ReactNode } from "react"
import { WagmiProvider } from "wagmi"

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
              {/* RainbowKit is used for its wallet list only; the connect
                  dialog is our own, so its provider and modals aren't mounted. */}
              <Tooltip.Provider delayDuration={200}>
                <Toast.Provider viewportClassName="bottom-[84px] md:bottom-6">
                  {children}
                </Toast.Provider>
              </Tooltip.Provider>
            </ViewerProvider>
          </NetworkProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  )
}
