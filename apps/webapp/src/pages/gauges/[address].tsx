import { InitialLoader } from "@/components/InitialLoader"
import type { GaugeProfile } from "@/config/supabase"
import { createClient } from "@supabase/supabase-js"
import type { GetServerSideProps } from "next"
import dynamic from "next/dynamic"
import Head from "next/head"

const GaugeDetailPage = dynamic(
  () => import("@/components/pages/GaugeDetailPage"),
  {
    ssr: false,
    loading: () => <InitialLoader />,
  },
)

type GaugePageProps = {
  address: string
  profile: GaugeProfile | null
}

export const getServerSideProps: GetServerSideProps<GaugePageProps> = async (
  context,
) => {
  const { address } = context.params as { address: string }
  const gaugeAddress = address.toLowerCase()

  let profile: GaugeProfile | null = null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data } = await supabase
      .from("gauge_profiles")
      .select("*")
      .eq("gauge_address", gaugeAddress)
      .single()
    profile = data as GaugeProfile | null
  }

  return {
    props: {
      address: gaugeAddress,
      profile,
    },
  }
}

export default function GaugeDetail({ address, profile }: GaugePageProps) {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://matchbox.mezo.org"
  const ogImageUrl = `${baseUrl}/api/og/gauge?address=${address}`
  const pageUrl = `${baseUrl}/gauges/${address}`

  const displayName = profile?.display_name ?? `Gauge ${address.slice(0, 8)}...`
  const description =
    profile?.description ??
    "View gauge details, vote stats, and boost multiplier on MatchBox."
  const title = `${displayName} | MatchBox`

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
      <GaugeDetailPage />
    </>
  )
}
