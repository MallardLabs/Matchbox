import { InitialLoader } from "@/components/InitialLoader"
import { getAppUrl, getOgImageUrl } from "@/utils/seo"
import type { GetServerSideProps } from "next"
import dynamic from "next/dynamic"
import Head from "next/head"

const ValidatorGaugeDetailPage = dynamic(
  () => import("@/components/pages/ValidatorGaugeDetailPage"),
  { ssr: false, loading: () => <InitialLoader /> },
)

type Props = { address: string }

export const getServerSideProps: GetServerSideProps<Props> = async (
  context,
) => {
  const { address } = context.params as { address: string }
  return { props: { address: address.toLowerCase() } }
}

export default function ValidatorGauge({ address }: Props): JSX.Element {
  const title = `Validator gauge ${address.slice(0, 8)}… | Matchbox`
  const description =
    "View a Mezo validator profile, gauge weight, voter incentives, expected APY, and validator rewards."
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="website" />
        <meta
          property="og:url"
          content={getAppUrl(`/validator-gauges/${address}`)}
        />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={getOgImageUrl()} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <ValidatorGaugeDetailPage address={address} />
    </>
  )
}
