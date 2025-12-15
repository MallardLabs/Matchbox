import "@mezo-org/mezo-clay/dist/mezo-clay.css"
import "@/styles/fonts.css"
import "@/styles/animations.css"
import { InitialLoader } from "@/components/InitialLoader"
import type { AppProps } from "next/app"
import dynamic from "next/dynamic"

// Dynamically import the client app with SSR disabled
const ClientApp = dynamic(
  () => import("@/components/ClientApp").then((mod) => mod.ClientApp),
  {
    ssr: false,
    loading: () => <InitialLoader />,
  },
)

export default function App({ Component, pageProps }: AppProps) {
  return <ClientApp Component={Component} pageProps={pageProps} />
}
