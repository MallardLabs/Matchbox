import { describe, expect, it } from "vitest"
import {
  type LogLevel,
  createLogger,
  formatPrettyLine,
  isSensitiveKey,
  redact,
} from "./index"

type Captured = { level: LogLevel; line: string }

function captureLogger(
  level: LogLevel = "debug",
  format: "json" | "pretty" = "json",
) {
  const lines: Captured[] = []
  const logger = createLogger({
    format,
    level,
    now: () => new Date("2026-09-30T12:00:00.000Z"),
    sink(sinkLevel, line) {
      lines.push({ level: sinkLevel, line })
    },
  })
  return { logger, lines }
}

function parseLine(line: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(line)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("expected an object log line")
  }
  return Object.fromEntries(Object.entries(parsed))
}

describe("isSensitiveKey", () => {
  it.each([
    "authorization",
    "Authorization",
    "cookie",
    "set-cookie",
    "secret",
    "clientSecret",
    "client_secret",
    "secretHash",
    "token",
    "accessToken",
    "refresh_token",
    "idToken",
    "password",
    "apiKey",
    "api_key",
    "x-api-key",
    "API_KEY_PEPPER",
    "privateKey",
  ])("redacts %s", (key) => {
    expect(isSensitiveKey(key)).toBe(true)
  })

  it.each([
    "message",
    "requestId",
    "tokenId",
    "vebtcTokenId",
    "keyId",
    "prefix",
    "status",
    "route",
  ])("keeps %s", (key) => {
    expect(isSensitiveKey(key)).toBe(false)
  })
})

describe("redact", () => {
  it("redacts nested keys and keeps structure", () => {
    expect(
      redact({
        headers: { Authorization: "Bearer abc", accept: "json" },
        list: [{ password: "p" }, 1],
        tokenId: "42",
      }),
    ).toEqual({
      headers: { Authorization: "[redacted]", accept: "json" },
      list: [{ password: "[redacted]" }, 1],
      tokenId: "42",
    })
  })

  it("serializes errors, bigints, dates and circular references", () => {
    const circular: Record<string, unknown> = { name: "loop" }
    circular.self = circular
    const error = new Error("boom", { cause: new Error("root") })
    const result = redact({
      error,
      amount: 10n,
      at: new Date("2026-01-01T00:00:00.000Z"),
      circular,
    })
    expect(result.amount).toBe("10")
    expect(result.at).toBe("2026-01-01T00:00:00.000Z")
    expect(result.circular).toEqual({ name: "loop", self: "[circular]" })
    expect(result.error).toMatchObject({
      name: "Error",
      message: "boom",
      cause: { message: "root" },
    })
  })
})

describe("createLogger", () => {
  it("emits one JSON line with level, time and message", () => {
    const { logger, lines } = captureLogger()
    logger.info({ message: "request served", status: 200 })
    expect(lines).toHaveLength(1)
    expect(lines[0]?.level).toBe("info")
    expect(parseLine(lines[0]?.line ?? "")).toEqual({
      level: "info",
      time: "2026-09-30T12:00:00.000Z",
      message: "request served",
      status: 200,
    })
  })

  it("filters below the configured level", () => {
    const { logger, lines } = captureLogger("warn")
    logger.debug({ message: "debug" })
    logger.info({ message: "info" })
    logger.warn({ message: "warn" })
    logger.error({ message: "error" })
    expect(lines.map((entry) => entry.level)).toEqual(["warn", "error"])
  })

  it("merges child fields and redacts them", () => {
    const { logger, lines } = captureLogger()
    const child = logger.child({ requestId: "req_1", apiKey: "mbx_sk" })
    child.child({ route: "/v1/health" }).error({ message: "failed" })
    expect(parseLine(lines[0]?.line ?? "")).toMatchObject({
      message: "failed",
      requestId: "req_1",
      apiKey: "[redacted]",
      route: "/v1/health",
    })
  })

  it("prints readable lines in pretty mode", () => {
    const { logger, lines } = captureLogger("debug", "pretty")
    logger.warn({ message: "slow query", ms: 812, table: "mbx dev" })
    expect(lines[0]?.line).toBe(
      '12:00:00.000 WARN  slow query ms=812 table="mbx dev"',
    )
  })
})

describe("formatPrettyLine", () => {
  it("omits the field section when empty", () => {
    expect(
      formatPrettyLine("info", new Date("2026-09-30T01:02:03.004Z"), "hi", {}),
    ).toBe("01:02:03.004 INFO  hi")
  })
})
