import { rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(here, "..")
const outDir = path.join(appRoot, ".tmp-test", "votingApr")
const require = createRequire(import.meta.url)
const tscPath = require.resolve("typescript/bin/tsc")

rmSync(outDir, { recursive: true, force: true })

const compile = spawnSync(
  process.execPath,
  [
    tscPath,
    "--outDir",
    outDir,
    "--module",
    "commonjs",
    "--target",
    "es2022",
    "--moduleResolution",
    "node",
    "--skipLibCheck",
    "--types",
    "node",
    "src/utils/votingApr.ts",
    "src/utils/votingApr.test.ts",
  ],
  {
    cwd: appRoot,
    stdio: "inherit",
  },
)

if (compile.status !== 0) {
  rmSync(outDir, { recursive: true, force: true })
  process.exit(compile.status ?? 1)
}

const run = spawnSync(process.execPath, [path.join(outDir, "votingApr.test.js")], {
  cwd: appRoot,
  stdio: "inherit",
})

rmSync(outDir, { recursive: true, force: true })

if (run.status !== 0) {
  process.exit(run.status ?? 1)
}
