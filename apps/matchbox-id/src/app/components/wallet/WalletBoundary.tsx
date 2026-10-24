import { type ReactElement, type ReactNode, Suspense, lazy } from "react"
import PageSkeleton from "../PageSkeleton"

const WalletProviders = lazy(() => import("./Providers"))

/** Mounts the lazily loaded wallet providers around a wallet page. */
export default function WalletBoundary({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WalletProviders>{children}</WalletProviders>
    </Suspense>
  )
}
