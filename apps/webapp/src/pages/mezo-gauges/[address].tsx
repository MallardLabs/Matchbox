import { InitialLoader } from "@/components/InitialLoader"
import { mezoGaugeIdentity } from "@/lib/mezoGauges"
import { getAppUrl, getOgImageUrl } from "@/utils/seo"
import type { GetServerSideProps } from "next"
import dynamic from "next/dynamic"
import Head from "next/head"
import { getAddress, isAddress } from "viem"

const MezoGaugeDetailPage = dynamic(
  () => import("@/components/pages/MezoGaugeDetailPage"),
  { ssr: false, loading: () => <InitialLoader /> },
)

type MezoGaugePageProps = {
  address: string
  name: string
}

export const getServerSideProps: GetServerSideProps<
  MezoGaugePageProps
> = async (context) => {
  const { address } = context.params as { address: string }
  if (!isAddress(address)) {
    return { notFound: true }
  }
  const checksummed = getAddress(address)
  const identity = mezoGaugeIdentity(checksummed)
  if (!identity) {
    return { notFound: true }
  }
  return {
    props: {
      address: checksummed,
      name: identity.name,
    },
  }
}

export default function MezoGaugePage({
  address,
  name,
}: MezoGaugePageProps): JSX.Element {
  const title = `${name} | MEZO Gauges | Matchbox`
  const description = `View TVL, volume, emissions, and add incentives for the ${name} MEZO gauge.`
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="website" />
        <meta
          property="og:url"
          content={getAppUrl(`/mezo-gauges/${address}`)}
        />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={getOgImageUrl()} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <MezoGaugeDetailPage address={address} />
    </>
  )
}
