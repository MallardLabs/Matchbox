import { cloudflare } from "@cloudflare/vite-plugin"
import { themeScript } from "@repo/ui/theme-script"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { type Plugin, defineConfig } from "vite"

/** Sets the theme class before first paint (no flash of the wrong theme). */
function themeScriptPlugin(): Plugin {
  return {
    name: "matchbox-theme-script",
    transformIndexHtml() {
      return [
        { tag: "script", children: themeScript, injectTo: "head-prepend" },
      ]
    },
  }
}

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    themeScriptPlugin(),
    cloudflare(),
  ],
  server: {
    port: 5175,
    strictPort: true,
  },
  preview: {
    port: 5175,
    strictPort: true,
  },
  build: {
    sourcemap: true,
  },
})
