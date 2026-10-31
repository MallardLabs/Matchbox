import {
  isServiceRequest,
  JOB_SECRET_HEADER,
  secretsMatch,
} from "./serviceRoleAuth.ts"

function assertEquals(actual: boolean, expected: boolean, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`)
  }
}

const serviceRoleKey = "service-role.jwt.value"
const anonKey = "anon.jwt.value"
const jobSecret = "job-secret-value"

function request(headers: Record<string, string>): Request {
  return new Request("http://local.test/functions/v1/job", {
    method: "POST",
    headers,
  })
}

Deno.test("only the service role key or the job secret authorizes a job", async () => {
  const cases: [string, Record<string, string>, boolean][] = [
    ["no credentials", {}, false],
    ["anon key", { authorization: `Bearer ${anonKey}` }, false],
    ["service role key", { authorization: `Bearer ${serviceRoleKey}` }, true],
    ["lower-case scheme", { authorization: `bearer ${serviceRoleKey}` }, true],
    ["bare key", { authorization: serviceRoleKey }, false],
    ["key prefix", { authorization: "Bearer service-role" }, false],
    ["key plus suffix", { authorization: `Bearer ${serviceRoleKey}x` }, false],
    ["job secret", { [JOB_SECRET_HEADER]: jobSecret }, true],
    ["wrong job secret", { [JOB_SECRET_HEADER]: anonKey }, false],
    ["service key as job secret", { [JOB_SECRET_HEADER]: serviceRoleKey }, false],
  ]
  for (const [label, headers, expected] of cases) {
    assertEquals(
      await isServiceRequest(request(headers), { serviceRoleKey, jobSecret }),
      expected,
      label,
    )
  }
})

Deno.test("unset secrets never match, even an empty credential", async () => {
  assertEquals(
    await isServiceRequest(request({ [JOB_SECRET_HEADER]: "" }), {
      serviceRoleKey,
      jobSecret: "",
    }),
    false,
    "empty job secret",
  )
  assertEquals(
    await isServiceRequest(request({ authorization: "Bearer " }), {
      serviceRoleKey: "",
      jobSecret: "",
    }),
    false,
    "empty service role key",
  )
  assertEquals(await secretsMatch("", ""), false, "empty pair")
  assertEquals(await secretsMatch("a", "a"), true, "equal pair")
})
