import { InitialLoader } from "@/components/InitialLoader"
import dynamic from "next/dynamic"
import Head from "next/head"

const BoostPage = dynamic(() => import("@/components/pages/BoostPage"), {
  ssr: false,
  loading: () => <InitialLoader />,
})

export default function Boost() {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://matchbox.mezo.org"
  const ogImageUrl = `${baseUrl}/api/og`
  const pageUrl = `${baseUrl}/boost`
  const title = "Boost | MatchBox"
  const description =
    "Vote with your veMEZO to boost gauges and maximize your rewards on Mezo."

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
      <BoostPage />
    </>
  )
}
