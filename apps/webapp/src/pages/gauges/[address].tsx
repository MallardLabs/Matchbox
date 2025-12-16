import { InitialLoader } from "@/components/InitialLoader"
import dynamic from "next/dynamic"

const GaugeDetailPage = dynamic(
  () => import("@/components/pages/GaugeDetailPage"),
  {
    ssr: false,
    loading: () => <InitialLoader />,
  },
)

export default function GaugeDetail() {
  return <GaugeDetailPage />
}
