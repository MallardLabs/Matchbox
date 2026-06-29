import { DeveloperShell } from "@/components/DeveloperShell"
import dynamic from "next/dynamic"
import Head from "next/head"

const ApiReference = dynamic(
  () =>
    import("@scalar/api-reference-react").then(
      (module) => module.ApiReferenceReact,
    ),
  { ssr: false },
)

export default function DocumentationPage(): JSX.Element {
  return (
    <>
      <Head>
        <title>API documentation · Matchbox Developers</title>
        <meta
          name="description"
          content="Interactive Matchbox Developer API documentation."
        />
      </Head>
      <DeveloperShell>
        <header className="mb-6">
          <p className="text-sm font-medium text-brand">API v1</p>
          <h1 className="mt-1 text-balance text-3xl font-semibold">
            Developer documentation
          </h1>
          <p className="mt-2 text-pretty text-stone-600">
            Use publishable keys for browser gauge reads and secret keys for
            server-side consented profiles.
          </p>
        </header>
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <ApiReference
            configuration={{
              url: "https://api.matchbox.markets/openapi.json",
              theme: "none",
              layout: "modern",
              hideClientButton: false,
              hideModels: false,
              defaultHttpClient: { targetKey: "js", clientKey: "fetch" },
            }}
          />
        </section>
      </DeveloperShell>
    </>
  )
}
