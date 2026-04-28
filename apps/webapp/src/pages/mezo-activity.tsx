import { InitialLoader } from "@/components/InitialLoader"
import { getAppUrl, getOgImageUrl } from "@/utils/seo"
import dynamic from "next/dynamic"
import Head from "next/head"

const MezoActivityPage = dynamic(() => import("@/components/pages/MezoActivityPage"), {
  ssr: false,
  loading: () => <InitialLoader />,
})

export default function MezoActivity() {
  const ogImageUrl = getOgImageUrl()
  const pageUrl = getAppUrl("/mezo-activity")
  const title = "Mezo Activity | Matchbox"
  const description =
    "Global activity feed for veMEZO lock creation, BTC boost actions, and veMEZO lock extensions."

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
      <MezoActivityPage />
    </>
  )
}
