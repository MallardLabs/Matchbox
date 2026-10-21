import { useBallotStore } from "@/features/vote/useBallotStore"
import { useNetwork } from "@/lib/network"
import { useViewer } from "@/lib/viewer"

/** Gauges on the Vote page's saved veMEZO ballot ("Open current ballot"). */
export default function useBallotCount(): number {
  const { chainId } = useNetwork()
  const { viewer } = useViewer()
  const [state] = useBallotStore(chainId, viewer.address, "vemezo")
  return state.ballot.filter((entry) => entry.bps > 0).length
}
