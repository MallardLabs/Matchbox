import { InitialLoader } from "@/components/InitialLoader"
import { getBaseUrl, getOgImageUrl } from "@/utils/seo"
import dynamic from "next/dynamic"
import Head from "next/head"

const HomePage = dynamic(() => import("@/components/pages/HomePage"), {
  ssr: false,
  loading: () => <InitialLoader />,
})

export default function Home() {
  const baseUrl = getBaseUrl()
  const ogImageUrl = getOgImageUrl()
  const title = "Matchbox | The Liquidity Layer for Mezo"
  const description =
    "Optimize your yields on Mezo. Vote with veMEZO to boost gauges and maximize your rewards through the Matchbox liquidity layer."

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={baseUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={baseUrl} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>
      <HomePage />
    </>
  )
}
