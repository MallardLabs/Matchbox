import { InitialLoader } from "@/components/InitialLoader"
import { getAppUrl, getOgImageUrl } from "@/utils/seo"
import dynamic from "next/dynamic"
import Head from "next/head"

const MezoGaugesPage = dynamic(
  () => import("@/components/pages/MezoGaugesPage"),
  {
    ssr: false,
    loading: () => <InitialLoader />,
  },
)

export default function MezoGauges() {
  const ogImageUrl = getOgImageUrl()
  const pageUrl = getAppUrl("/mezo-gauges")
  const title = "MEZO gauges | Matchbox"
  const description =
    "Track how veMEZO holders direct MEZO emissions to MUSD liquidity on Curve, Uniswap and Aerodrome: participation, gauge weights, emissions, destination liquidity and claims."

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={pageUrl} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>
      <MezoGaugesPage />
    </>
  )
}
