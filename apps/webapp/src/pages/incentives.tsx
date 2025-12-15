import { InitialLoader } from "@/components/InitialLoader"
import dynamic from "next/dynamic"

const IncentivesPage = dynamic(
  () => import("@/components/pages/IncentivesPage"),
  {
    ssr: false,
    loading: () => <InitialLoader />,
  },
)

export default function Incentives() {
  return <IncentivesPage />
}
