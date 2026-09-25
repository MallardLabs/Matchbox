import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { fileURLToPath } from "node:url"

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const required = {
  NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID: "test-project-id",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
}

function loadBuildConfig(overrides = {}, phase = "phase-production-build") {
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
      import config from "next/dist/server/config.js";
      try {
        await config.default(${JSON.stringify(phase)}, process.cwd());
        process.exit(0);
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
    `,
    ],
    {
      cwd: appRoot,
      env: { ...process.env, ...required, ...overrides },
      encoding: "utf8",
      timeout: 20000,
    },
  )
}

for (const name of Object.keys(required)) {
  test(`production build rejects missing ${name}`, () => {
    const result = loadBuildConfig({ [name]: "" })
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, new RegExp(name))
  })
}

test("production build accepts configured public services", () => {
  const result = loadBuildConfig()
  assert.equal(result.status, 0, result.stderr)
})

test("production server does not require build-time variables again", () => {
  const result = loadBuildConfig(
    Object.fromEntries(Object.keys(required).map((name) => [name, ""])),
    "phase-production-server",
  )
  assert.equal(result.status, 0, result.stderr)
})
