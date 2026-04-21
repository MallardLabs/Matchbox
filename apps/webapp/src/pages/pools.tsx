import { InitialLoader } from "@/components/InitialLoader"
import { getAppUrl, getOgImageUrl } from "@/utils/seo"
import dynamic from "next/dynamic"
import Head from "next/head"

const PoolsPage = dynamic(() => import("@/components/pages/PoolsPage"), {
  ssr: false,
  loading: () => <InitialLoader />,
})

export default function Pools() {
  const ogImageUrl = getOgImageUrl()
  const pageUrl = getAppUrl("/pools")
  const title = "Pools | Matchbox"
  const description =
    "Fund Mezo liquidity pools directly. Add incentives to LP bribes, view fees APR, emissions APY, TVL, and volume across all Mezo pools."

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={pageUrl} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>
      <PoolsPage />
    </>
  )
}
