import { rmSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(here, "..")
const outDir = path.join(appRoot, ".tmp-test")
const loaderPath = path.join(here, "test-loader.cjs")
const require = createRequire(import.meta.url)
const tscPath = require.resolve("typescript/bin/tsc")

const sourceFiles = [
  "src/utils/votingApr.ts",
  "src/utils/votingApr.test.ts",
  "src/utils/safeBatch.ts",
  "src/utils/safeBatch.test.ts",
  "src/utils/validatorVoting.ts",
  "src/utils/validatorVoting.test.ts",
  "src/utils/validatorApy.ts",
  "src/utils/validatorApy.test.ts",
  "src/utils/rewardPerVeMezo.ts",
  "src/utils/rewardPerVeMezo.test.ts",
  "src/lib/academy/simulate.ts",
  "src/lib/academy/simulate.test.ts",
  "src/lib/academy/epoch.ts",
  "src/lib/academy/snfActors.ts",
  "src/lib/academy/blacklistedActors.ts",
  "src/lib/mezoActivity/constants.ts",
  "src/types/mezoActivity.ts",
]

const testEntries = [
  "utils/votingApr.test.js",
  "utils/safeBatch.test.js",
  "utils/validatorVoting.test.js",
  "utils/validatorApy.test.js",
  "utils/rewardPerVeMezo.test.js",
  "lib/academy/simulate.test.js",
]

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const tsconfigPath = path.join(outDir, "tsconfig.test.json")
writeFileSync(
  tsconfigPath,
  JSON.stringify(
    {
      compilerOptions: {
        outDir,
        rootDir: path.join(appRoot, "src"),
        module: "commonjs",
        target: "es2022",
        moduleResolution: "node",
        esModuleInterop: true,
        skipLibCheck: true,
        types: ["node"],
        baseUrl: appRoot,
        paths: { "@/*": ["src/*"] },
      },
      files: sourceFiles.map((rel) => path.join(appRoot, rel)),
    },
    null,
    2,
  ),
)

const compile = spawnSync(
  process.execPath,
  [tscPath, "--project", tsconfigPath],
  {
    cwd: appRoot,
    stdio: "inherit",
  },
)

if (compile.status !== 0) {
  rmSync(outDir, { recursive: true, force: true })
  process.exit(compile.status ?? 1)
}

let exitCode = 0
for (const entry of testEntries) {
  const run = spawnSync(
    process.execPath,
    ["--require", loaderPath, path.join(outDir, entry)],
    {
      cwd: appRoot,
      stdio: "inherit",
      env: { ...process.env, TEST_OUT_DIR: outDir },
    },
  )
  if (run.status !== 0) {
    exitCode = run.status ?? 1
    break
  }
}

rmSync(outDir, { recursive: true, force: true })

if (exitCode !== 0) {
  process.exit(exitCode)
}
