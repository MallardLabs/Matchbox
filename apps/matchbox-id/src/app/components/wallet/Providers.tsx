import { RainbowKitProvider } from "@rainbow-me/rainbowkit"
import { type ReactElement, type ReactNode, useCallback, useState } from "react"
import { WagmiProvider } from "wagmi"
import { mezoMainnet, wagmiConfig } from "../../lib/wallet/config"
import ConnectModal from "./ConnectModal"
import { WalletDialogProvider } from "./WalletDialogContext"
import "@rainbow-me/rainbowkit/styles.css"

/**
 * The wallet stack (wagmi, viem, RainbowKit, Mezo Passport). Loaded lazily
 * through `WalletBoundary` by the pages that need a wallet; `wagmiConfig` is
 * a module singleton, so connection state survives page changes.
 */
export default function WalletProviders({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const [connectOpen, setConnectOpen] = useState(false)
  const openConnect = useCallback(() => setConnectOpen(true), [])
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider initialChain={mezoMainnet}>
        <WalletDialogProvider onOpenConnect={openConnect}>
          {children}
          <ConnectModal open={connectOpen} onOpenChange={setConnectOpen} />
        </WalletDialogProvider>
      </RainbowKitProvider>
    </WagmiProvider>
  )
}
