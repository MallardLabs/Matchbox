import { defineConfig } from "tsup"

/** ESM build (jose stays external). CJS: tsup.cjs.config.ts. */
export default defineConfig({
  entry: { index: "src/index.ts", oidc: "src/oidc.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  platform: "neutral",
})
