import PrivacyPage from "@/components/pages/PrivacyPage"
import Head from "next/head"

export default function Privacy() {
  const title = "Privacy policy | Matchbox"
  const description =
    "How Matchbox, Matchbox Pro, Matchbox Developer and Matchbox ID handle personal data."

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href="https://app.matchbox.markets/privacy" />
      </Head>
      <PrivacyPage />
    </>
  )
}
