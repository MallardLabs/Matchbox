import type { GetServerSideProps } from "next"

export default function IndexPage(): null {
  return null
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const host = context.req.headers.host?.split(":")[0]
  return {
    redirect: {
      destination: host === "id.matchbox.markets" ? "/apps" : "/developers",
      permanent: false,
    },
  }
}
