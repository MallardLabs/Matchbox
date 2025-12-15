import { InitialLoader } from "@/components/InitialLoader"
import dynamic from "next/dynamic"

const DashboardPage = dynamic(
  () => import("@/components/pages/DashboardPage"),
  {
    ssr: false,
    loading: () => <InitialLoader />,
  },
)

export default function Dashboard() {
  return <DashboardPage />
}
