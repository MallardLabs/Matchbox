import { defineConfig } from "tsup"

/**
 * CJS build. jose is ESM-only, so it is bundled here to keep `require()`
 * working on every supported Node version. Runs after the ESM build (the
 * two dts builds crash intermittently on Windows when run in parallel).
 */
export default defineConfig({
  entry: { index: "src/index.ts", oidc: "src/oidc.ts" },
  format: ["cjs"],
  dts: true,
  sourcemap: true,
  clean: false,
  target: "es2022",
  platform: "neutral",
  noExternal: ["jose"],
})
