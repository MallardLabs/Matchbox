import { fileURLToPath, URL } from "node:url"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { handleApiRequest } from "./src/worker/index"

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    {
      name: "matchbox-pro-api",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith("/api/")) {
            next()
            return
          }
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method ?? "GET",
          })
          const response = await handleApiRequest(request, {
            BASE_RPC_URL: process.env.BASE_RPC_URL,
          })
          if (!response) {
            next()
            return
          }
          res.statusCode = response.status
          response.headers.forEach((value, key) => {
            res.setHeader(key, value)
          })
          res.end(await response.text())
        })
      },
    },
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
})
