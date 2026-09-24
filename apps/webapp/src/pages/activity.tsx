import { InitialLoader } from "@/components/InitialLoader"
import { getAppUrl, getOgImageUrl } from "@/utils/seo"
import dynamic from "next/dynamic"
import Head from "next/head"
import Link from "next/link"
import { useRouter } from "next/router"

const MezoActivityPage = dynamic(
  () => import("@/components/pages/MezoActivityPage"),
  {
    ssr: false,
    loading: () => <InitialLoader />,
  },
)

const MezoGaugesPage = dynamic(
  () => import("@/components/pages/MezoGaugesPage"),
  {
    ssr: false,
    loading: () => <InitialLoader />,
  },
)

export default function Activity() {
  const router = useRouter()
  const view = router.query.view === "mezo-gauges" ? "mezo-gauges" : "activity"

  const ogImageUrl = getOgImageUrl()
  const pageUrl = getAppUrl("/activity")
  const title =
    view === "mezo-gauges" ? "MEZO gauges | Matchbox" : "Activity | Matchbox"
  const description =
    view === "mezo-gauges"
      ? "veMEZO participation, emissions, MUSD liquidity and Merkl claims for MEZO gauges."
      : "Global activity feed for veMEZO lock creation, BTC boost actions, and veMEZO lock extensions."

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
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 md:pt-8">
        <nav
          aria-label="Activity views"
          className="inline-flex self-start rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1"
        >
          <Link
            href="/activity?view=activity"
            aria-current={view === "activity" ? "page" : undefined}
            className={`rounded-md px-4 py-2 text-sm font-medium no-underline ${
              view === "activity"
                ? "bg-[#F7931A] text-black"
                : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
            }`}
          >
            Activity
          </Link>
          <Link
            href="/activity?view=mezo-gauges"
            aria-current={view === "mezo-gauges" ? "page" : undefined}
            className={`rounded-md px-4 py-2 text-sm font-medium no-underline ${
              view === "mezo-gauges"
                ? "bg-[#F7931A] text-black"
                : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
            }`}
          >
            MEZO gauges
          </Link>
        </nav>
      </div>
      {view === "mezo-gauges" ? <MezoGaugesPage /> : <MezoActivityPage />}
    </>
  )
}
