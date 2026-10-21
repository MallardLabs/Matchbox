import type { IncomingMessage } from "node:http"
import { URL, fileURLToPath } from "node:url"
import { themeScript } from "@repo/ui/theme-script"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { type Plugin, defineConfig, loadEnv } from "vite"
import { type WorkerEnv, handleApiRequest } from "./src/worker/index"

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks)))
    req.on("error", reject)
  })
}

// Serves the Worker's /api routes from the Vite dev server so local dev
// matches production without running wrangler.
function workerApi(env: WorkerEnv): Plugin {
  return {
    name: "matchbox-pro-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next()
          return
        }
        try {
          const method = req.method ?? "GET"
          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value)
          }
          const body =
            method === "GET" || method === "HEAD"
              ? undefined
              : await readBody(req)
          const request = new Request(`http://localhost${req.url}`, {
            method,
            headers,
            body: body ? new Uint8Array(body) : null,
          })
          const response = await handleApiRequest(request, env)
          if (!response) {
            next()
            return
          }
          res.statusCode = response.status
          response.headers.forEach((value, key) => {
            res.setHeader(key, value)
          })
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          res.statusCode = 500
          res.setHeader("content-type", "application/json")
          res.end(JSON.stringify({ error: "Dev API failed" }))
          server.config.logger.error(
            `[api] ${req.url}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      })
    },
  }
}

const themeScriptPlugin: Plugin = {
  name: "matchbox-theme-script",
  transformIndexHtml: () => [
    { tag: "script", children: themeScript, injectTo: "head-prepend" },
  ],
}

export default defineConfig(({ mode }) => {
  // The dev middleware runs the Worker in Node, so it gets every server-side
  // variable from .env files, like `wrangler dev` gets .dev.vars.
  const workerEnv: WorkerEnv = loadEnv(mode, process.cwd(), "")
  return {
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routesDirectory: "./src/routes",
        generatedRouteTree: "./src/routeTree.gen.ts",
      }),
      react(),
      themeScriptPlugin,
      workerApi(workerEnv),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
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
      port: 3002,
      strictPort: true,
    },
    preview: {
      port: 3002,
      strictPort: true,
    },
    build: {
      outDir: "dist/client",
      sourcemap: true,
    },
  }
})
