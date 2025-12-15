import { InitialLoader } from "@/components/InitialLoader"
import dynamic from "next/dynamic"

const GaugesPage = dynamic(() => import("@/components/pages/GaugesPage"), {
  ssr: false,
  loading: () => <InitialLoader />,
})

export default function Gauges() {
  return <GaugesPage />
}
