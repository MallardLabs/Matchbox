import "@/styles/globals.css"
import "@mezo-org/mezo-clay/dist/mezo-clay.css"
import { InitialLoader } from "@/components/InitialLoader"
import type { AppProps } from "next/app"
import dynamic from "next/dynamic"
import Head from "next/head"

// Dynamically import the client app with SSR disabled
const ClientApp = dynamic(
  () => import("@/components/ClientApp").then((mod) => mod.ClientApp),
  {
    ssr: false,
    loading: () => <InitialLoader />,
  },
)

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </Head>
      <ClientApp Component={Component} pageProps={pageProps} />
    </>
  )
}
