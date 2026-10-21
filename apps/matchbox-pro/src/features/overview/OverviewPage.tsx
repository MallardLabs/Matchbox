import LockFlows from "@/features/locks/LockFlows"
import MyLocks from "@/features/locks/MyLocks"
import { useViewer } from "@/lib/viewer"
import type { ReactElement } from "react"
import MarketOverview from "./MarketOverview"
import OverviewHero from "./OverviewHero"
import { useOverview } from "./useOverview"

/** Home: the public market for visitors, the wallet's epoch dashboard otherwise. */
export default function OverviewPage(): ReactElement {
  const { viewer } = useViewer()
  if (viewer.mode === "disconnected") return <MarketOverview />
  return <WalletOverview key={viewer.address} />
}

function WalletOverview(): ReactElement {
  const overview = useOverview()
  const { refetch } = overview

  return (
    <LockFlows
      locks={overview.locks}
      claimSources={overview.claims.sources}
      nowSeconds={overview.nowSeconds}
      onChanged={refetch}
    >
      <div className="flex flex-col gap-7">
        <OverviewHero overview={overview} />
        <MyLocks
          state={overview.locksState}
          locks={overview.locks}
          nowSeconds={overview.nowSeconds}
          onRetry={() => void refetch()}
        />
      </div>
    </LockFlows>
  )
}
