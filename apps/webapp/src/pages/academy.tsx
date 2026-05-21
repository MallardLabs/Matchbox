import { InitialLoader } from "@/components/InitialLoader"
import { getAppUrl, getOgImageUrl } from "@/utils/seo"
import dynamic from "next/dynamic"
import Head from "next/head"

const AcademyPage = dynamic(() => import("@/components/pages/AcademyPage"), {
  ssr: false,
  loading: () => <InitialLoader />,
})

export default function Academy() {
  const ogImageUrl = getOgImageUrl()
  const pageUrl = getAppUrl("/academy")
  const title = "Academy | Matchbox"
  const description =
    "Mezo Academy reward simulator. Model what veMEZO lockers and veBTC voters would earn over a chosen window, in easy or pro mode."

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
      <AcademyPage />
    </>
  )
}
