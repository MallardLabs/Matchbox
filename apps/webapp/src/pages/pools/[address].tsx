import { InitialLoader } from "@/components/InitialLoader"
import { getAppUrl, getOgImageUrl } from "@/utils/seo"
import type { GetServerSideProps } from "next"
import dynamic from "next/dynamic"
import Head from "next/head"

const PoolDetailPage = dynamic(
  () => import("@/components/pages/PoolDetailPage"),
  {
    ssr: false,
    loading: () => <InitialLoader />,
  },
)

type PoolPageProps = {
  address: string
}

export const getServerSideProps: GetServerSideProps<PoolPageProps> = async (
  context,
) => {
  const { address } = context.params as { address: string }
  return { props: { address: address.toLowerCase() } }
}

export default function PoolDetail({ address }: PoolPageProps) {
  const ogImageUrl = getOgImageUrl()
  const pageUrl = getAppUrl(`/pools/${address}`)
  const title = `Pool ${address.slice(0, 8)}… | Matchbox`
  const description =
    "View pool stats, current incentives, and add rewards to this Mezo liquidity pool's bribe contract."

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
      <PoolDetailPage address={address} />
    </>
  )
}
