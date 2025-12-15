import { InitialLoader } from "@/components/InitialLoader"
import dynamic from "next/dynamic"

const HomePage = dynamic(() => import("@/components/pages/HomePage"), {
  ssr: false,
  loading: () => <InitialLoader />,
})

export default function Home() {
  return <HomePage />
}
