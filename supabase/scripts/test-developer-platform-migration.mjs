import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const expectedRef = process.env.MATCHBOX_MIGRATION_TEST_PROJECT_REF
const linkedRef = readFileSync(
  join(root, "supabase/.temp/project-ref"),
  "utf8",
).trim()
if (
  !expectedRef ||
  linkedRef !== expectedRef ||
  linkedRef === "xyeyuamvydligyjgzqnt"
) {
  throw new Error(
    "Set MATCHBOX_MIGRATION_TEST_PROJECT_REF to the linked non-production project",
  )
}

const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20260620000001_create_developer_platform.sql",
  ),
  "utf8",
)
const folder = mkdtempSync(join(tmpdir(), "matchbox-migration-test-"))
const file = join(folder, "test.sql")
writeFileSync(
  file,
  `
BEGIN;
SET LOCAL search_path = public;
${migration}
DO $test$
DECLARE
  organization_id uuid;
  generated_client_id text;
BEGIN
  INSERT INTO public.developer_organizations (name, slug)
  VALUES ('Migration regression', 'migration-regression-' || gen_random_uuid()::text)
  RETURNING id INTO organization_id;
  INSERT INTO public.developer_apps (organization_id, name)
  VALUES (organization_id, 'Migration regression')
  RETURNING client_id INTO generated_client_id;
  IF generated_client_id !~ '^mbx_app_[a-f0-9]{36}$' THEN
    RAISE EXCEPTION 'Unexpected generated client ID format';
  END IF;
END;
$test$;
ROLLBACK;
`,
)
try {
  const result = spawnSync(
    process.platform === "win32" ? "supabase.exe" : "supabase",
    ["db", "query", "--linked", "--file", file],
    { cwd: root, encoding: "utf8", windowsHide: true },
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    process.exitCode = result.status ?? 1
  } else {
    console.log(
      "PASS: beta migration creates apps with generated client IDs under search_path=public; transaction rolled back",
    )
  }
} finally {
  rmSync(folder, { recursive: true, force: true })
}
