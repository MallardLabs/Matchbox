// The OpenNext bundle is generated before Wrangler bundles this entry point.
// @ts-expect-error The generated module does not ship TypeScript declarations.
import openNextWorker from "./.open-next/worker.js"

const DOCS_ORIGIN = "https://matchdocs.netlify.app"

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

function isDocsRequest(pathname: string): boolean {
  return (
    pathname === "/docs" ||
    pathname.startsWith("/docs/") ||
    pathname === "/_astro" ||
    pathname.startsWith("/_astro/") ||
    pathname === "/pagefind" ||
    pathname.startsWith("/pagefind/") ||
    pathname === "/favicon.svg"
  )
}

async function proxyDocs(request: Request): Promise<Response> {
  const target = new URL(request.url)
  const docsOrigin = new URL(DOCS_ORIGIN)
  target.protocol = docsOrigin.protocol
  target.host = docsOrigin.host

  const headers = new Headers(request.headers)
  headers.delete("host")

  return fetch(
    new Request(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    }),
  )
}

export default {
  async fetch(
    request: Request,
    env: unknown,
    ctx: WorkerExecutionContext,
  ): Promise<Response> {
    if (isDocsRequest(new URL(request.url).pathname)) {
      return proxyDocs(request)
    }

    return openNextWorker.fetch(request, env, ctx)
  },
}
