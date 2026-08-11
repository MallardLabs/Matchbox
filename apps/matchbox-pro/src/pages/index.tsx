import { QueryPrototype } from "@/components/query/QueryPrototype"
import Head from "next/head"

export default function HomePage() {
  return (
    <>
      <Head>
        <title>Stuart Query — Matchbox Pro</title>
        <meta
          content="A working prototype of Stuart Query for Matchbox Pro."
          name="description"
        />
      </Head>
      <QueryPrototype />
    </>
  )
}
