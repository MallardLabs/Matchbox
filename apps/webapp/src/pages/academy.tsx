import AcademyPublicPage from "@/components/pages/AcademyPublicPage"
import { getAppUrl, getOgImageUrl } from "@/utils/seo"
import Head from "next/head"

export default function Academy() {
  const ogImageUrl = getOgImageUrl()
  const pageUrl = getAppUrl("/academy")
  const title = "Academy Leaderboard | Matchbox"
  const description =
    "Mezo Academy points leaderboard. View protocol participation and points distribution for veMEZO lockers and veBTC voters."

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

        <link
          rel="preload"
          href="/api/academy/leaderboard?network=mainnet"
          as="fetch"
          crossOrigin="anonymous"
        />
      </Head>
      <AcademyPublicPage />
    </>
  )
}
