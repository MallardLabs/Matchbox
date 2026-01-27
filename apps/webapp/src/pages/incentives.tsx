import { InitialLoader } from "@/components/InitialLoader"
import { getBaseUrl, getOgImageUrl } from "@/utils/seo"
import dynamic from "next/dynamic"
import Head from "next/head"

const IncentivesPage = dynamic(
  () => import("@/components/pages/IncentivesPage"),
  {
    ssr: false,
    loading: () => <InitialLoader />,
  },
)

export default function Incentives() {
  const baseUrl = getBaseUrl()
  const ogImageUrl = getOgImageUrl()
  const pageUrl = `${baseUrl}/incentives`
  const title = "veBTC | Matchbox"
  const description =
    "Create and manage incentives for Mezo gauges to attract veMEZO liquidity to your project through the Matchbox incentive layer."

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
      <IncentivesPage />
    </>
  )
}
