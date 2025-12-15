import { InitialLoader } from "@/components/InitialLoader"
import dynamic from "next/dynamic"

const BoostPage = dynamic(() => import("@/components/pages/BoostPage"), {
  ssr: false,
  loading: () => <InitialLoader />,
})

export default function Boost() {
  return <BoostPage />
}
