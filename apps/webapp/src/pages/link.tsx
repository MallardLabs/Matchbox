import LinkWalletPage from "@/components/pages/LinkWalletPage"
import Head from "next/head"

export default function Link() {
  const title = "Link your wallet | Matchbox"
  const description = "Verify your wallet to link it to your Discord account."

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
