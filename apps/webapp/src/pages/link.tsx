import LinkWalletPage from "@/components/pages/LinkWalletPage"
import Head from "next/head"

export default function Link() {
  const title = "Link your wallet | Matchbox"
  const description =
    "Verify ownership of your wallet to link it to your Discord account and track your Mezo Academy points."

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        {/* Per-user linking page — keep it out of search indexes. */}
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <LinkWalletPage />
    </>
  )
}
