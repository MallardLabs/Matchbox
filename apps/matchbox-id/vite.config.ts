import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { cloudflare } from "@cloudflare/vite-plugin"
import { themeScript } from "@repo/ui/theme-script"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { type Plugin, type Rollup, defineConfig } from "vite"
import { spaHeadersFile } from "./src/shared/csp"

const require = createRequire(import.meta.url)

const favicons = {
  "/favicon-light.png": require.resolve(
    "@repo/ui/assets/matchbox-icon-light.png",
  ),
  "/favicon-dark.png": require.resolve(
    "@repo/ui/assets/matchbox-icon-dark.png",
  ),
} as const

function isFaviconPath(path: string): path is keyof typeof favicons {
  return path in favicons
}

/** npm package that owns a module id (`@scope/name` or `name`), if any. */
function packageOf(id: string): string | null {
  const path = id.replaceAll("\\", "/")
  const marker = "/node_modules/"
  const index = path.lastIndexOf(marker)
  if (index === -1) return null
  const [first, second] = path.slice(index + marker.length).split("/")
  if (first === undefined || first.length === 0) return null
  return first.startsWith("@") && second !== undefined
    ? `${first}/${second}`
    : first
}

// The wallet core is only imported by the lazily loaded wallet providers and
// the pages that need a wallet (sign-in, account). Connector SDKs
// (WalletConnect, MetaMask, Coinbase, …) stay in their own dynamic chunks.
const walletScopes = ["@rainbow-me/", "@mezo-org/", "@wagmi/"]
const walletPackages = new Set(["wagmi", "viem", "ox", "abitype", "porto"])
const reactPackages = new Set([
  "react",
  "react-dom",
  "scheduler",
  "@tanstack/react-query",
  "@tanstack/query-core",
  "@tanstack/react-router",
  "@tanstack/router-core",
  "@tanstack/history",
  "@tanstack/react-store",
  "@tanstack/store",
])

type ModuleGraph = Pick<
  Rollup.ManualChunkMeta,
  "getModuleIds" | "getModuleInfo"
>

type ChunkPlan = {
  /** Everything the entry imports statically. */
  entry: Set<string>
  /** React packages and everything they import (no chunk cycles). */
  react: Set<string>
}

// Computed once per build (keyed by the build's module graph).
const chunkPlans = new WeakMap<
  Rollup.ManualChunkMeta["getModuleInfo"],
  ChunkPlan
>()

function staticClosure(graph: ModuleGraph, seeds: string[]): Set<string> {
  const reached = new Set<string>()
  const pending = [...seeds]
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (reached.has(id)) continue
    reached.add(id)
    pending.push(...(graph.getModuleInfo(id)?.importedIds ?? []))
  }
  return reached
}

function chunkPlan(graph: ModuleGraph): ChunkPlan {
  const cached = chunkPlans.get(graph.getModuleInfo)
  if (cached !== undefined) return cached
  const ids = [...graph.getModuleIds()]
  const plan = {
    entry: staticClosure(
      graph,
      ids.filter((id) => graph.getModuleInfo(id)?.isEntry === true),
    ),
    react: staticClosure(
      graph,
      ids.filter((id) => reactPackages.has(packageOf(id) ?? "")),
    ),
  }
  chunkPlans.set(graph.getModuleInfo, plan)
  return plan
}

/**
 * Splits the SPA vendor code into long-lived, separately cached chunks:
 * `react-vendor`, `vendor` (other packages the entry needs) and `wallet`
 * (the wallet core, loaded only with the lazy wallet providers). Everything
 * the entry reaches is claimed first, because Rollup pulls a manual chunk's
 * unclaimed dependencies into it (that would make the entry load `wallet`).
 */
function vendorChunk(
  id: string,
  meta: Rollup.ManualChunkMeta,
): string | undefined {
  const plan = chunkPlan(meta)
  const name = packageOf(id)
  // Virtual helpers (`\0vite/preload-helper`, `\0commonjsHelpers`) count too.
  const vendored = name !== null || id.startsWith("\0")
  if (!vendored || !plan.entry.has(id)) {
    const isWallet =
      name !== null &&
      (walletPackages.has(name) ||
        walletScopes.some((scope) => name.startsWith(scope)))
    // Lazily imported pieces (wallet icons, locales) keep their own chunks.
    const lazy = (meta.getModuleInfo(id)?.dynamicImporters.length ?? 0) > 0
    return isWallet && !lazy ? "wallet" : undefined
  }
  return plan.react.has(id) ? "react-vendor" : "vendor"
}

/** Sets the theme class before first paint and links the @repo/ui icons. */
function documentHead(): Plugin {
  return {
    name: "matchbox-id-document-head",
    transformIndexHtml() {
      return [
        { tag: "script", children: themeScript, injectTo: "head-prepend" },
        {
          tag: "link",
          attrs: {
            rel: "icon",
            type: "image/png",
            href: "/favicon-light.png",
            media: "(prefers-color-scheme: light)",
          },
          injectTo: "head",
        },
        {
          tag: "link",
          attrs: {
            rel: "icon",
            type: "image/png",
            href: "/favicon-dark.png",
            media: "(prefers-color-scheme: dark)",
          },
          injectTo: "head",
        },
      ]
    },
    configureServer(server) {
      server.middlewares.use(function serveFavicon(req, res, next) {
        const path = req.url ?? ""
        if (!isFaviconPath(path)) return next()
        res.setHeader("Content-Type", "image/png")
        res.end(readFileSync(favicons[path]))
      })
    },
    generateBundle() {
      if (this.environment.name !== "client") return
      for (const [path, source] of Object.entries(favicons)) {
        this.emitFile({
          type: "asset",
          fileName: path.slice(1),
          source: readFileSync(source),
        })
      }
    },
  }
}

/**
 * Writes `_headers` (CSP with hashes of the final inline scripts, HSTS,
 * `Referrer-Policy: no-referrer` on /authorize) next to the built SPA.
 */
function securityHeadersFile(): Plugin {
  return {
    name: "matchbox-id-security-headers",
    apply: "build",
    writeBundle(options) {
      if (this.environment.name !== "client" || options.dir === undefined) {
        return
      }
      const html = readFileSync(join(options.dir, "index.html"), "utf8")
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
        (match) =>
          `sha256-${createHash("sha256")
            .update(match[1] ?? "")
            .digest("base64")}`,
      )
      writeFileSync(join(options.dir, "_headers"), spaHeadersFile(hashes))
    },
  }
}

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/app/routes",
      generatedRouteTree: "./src/app/routeTree.gen.ts",
    }),
    react(),
    cloudflare(),
    documentHead(),
    securityHeadersFile(),
  ],
  resolve: {
    alias: {
      buffer: "buffer",
    },
  },
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    include: [
      "wagmi",
      "viem",
      "@rainbow-me/rainbowkit",
      "@mezo-org/passport/dist/src/constants.js",
      "@mezo-org/passport/dist/src/wallet/index.js",
    ],
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  server: {
    port: 5180,
    strictPort: true,
  },
  preview: {
    port: 5180,
    strictPort: true,
  },
  build: {
    sourcemap: true,
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          output: { manualChunks: vendorChunk },
        },
      },
    },
  },
})
