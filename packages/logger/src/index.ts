export type LogLevel = "debug" | "info" | "warn" | "error"

export type LogFormat = "json" | "pretty"

export type LogFields = Record<string, unknown>

export type LogEntry = { message: string } & LogFields

export type LogSink = (level: LogLevel, line: string) => void

export type Logger = {
  debug(entry: LogEntry): void
  info(entry: LogEntry): void
  warn(entry: LogEntry): void
  error(entry: LogEntry): void
  child(fields: LogFields): Logger
}

export type LoggerOptions = {
  level?: LogLevel
  format?: LogFormat
  fields?: LogFields
  sink?: LogSink
  now?: () => Date
}

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const redactedValue = "[redacted]"
const maxDepth = 8
const alwaysSensitiveWords = new Set([
  "authorization",
  "cookie",
  "cookies",
  "password",
  "passwd",
  "pepper",
  "secret",
  "secrets",
])
const trailingSensitiveWords = new Set(["token", "tokens"])

function splitKeyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase())
}

/**
 * A key is sensitive when it names a credential: any word is one of
 * authorization/cookie/password/secret/pepper, it ends in "token" (so
 * `accessToken` is redacted but `tokenId` is not), or it contains an
 * "api key"/"private key" pair.
 */
export function isSensitiveKey(key: string): boolean {
  const words = splitKeyWords(key)
  if (words.length === 0) return false
  if (words.some((word) => alwaysSensitiveWords.has(word))) return true
  if (words.some((word) => word === "apikey" || word === "privatekey")) {
    return true
  }
  const last = words[words.length - 1]
  if (last !== undefined && trailingSensitiveWords.has(last)) return true
  for (let index = 0; index < words.length - 1; index++) {
    const current = words[index]
    const next = words[index + 1]
    if ((current === "api" || current === "private") && next === "key") {
      return true
    }
  }
  return false
}

function serializeError(error: Error, seen: WeakSet<object>, depth: number) {
  const serialized: LogFields = {
    name: error.name,
    message: error.message,
  }
  if (error.stack !== undefined) serialized.stack = error.stack
  if (error.cause !== undefined) {
    serialized.cause = sanitize(error.cause, seen, depth + 1)
  }
  return serialized
}

function sanitize(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "function" || typeof value === "symbol") {
    return String(value)
  }
  if (value === null || typeof value !== "object") return value
  if (seen.has(value)) return "[circular]"
  if (depth >= maxDepth) return "[truncated]"
  seen.add(value)
  try {
    if (value instanceof Error) return serializeError(value, seen, depth)
    if (value instanceof Date) return value.toISOString()
    if (Array.isArray(value)) {
      return value.map((item) => sanitize(item, seen, depth + 1))
    }
    if (value instanceof Map) {
      return sanitize(Object.fromEntries(value), seen, depth + 1)
    }
    if (value instanceof Set) {
      return sanitize([...value], seen, depth + 1)
    }
    const output: LogFields = {}
    for (const [key, nested] of Object.entries(value)) {
      output[key] = isSensitiveKey(key)
        ? redactedValue
        : sanitize(nested, seen, depth + 1)
    }
    return output
  } finally {
    seen.delete(value)
  }
}

/** Returns a JSON-safe deep copy of `fields` with credential keys redacted. */
export function redact(fields: LogFields): LogFields {
  const output: LogFields = {}
  const seen = new WeakSet<object>()
  for (const [key, value] of Object.entries(fields)) {
    output[key] = isSensitiveKey(key) ? redactedValue : sanitize(value, seen, 0)
  }
  return output
}

function readProcessEnv(name: string): string | undefined {
  const processValue: unknown = Reflect.get(globalThis, "process")
  if (typeof processValue !== "object" || processValue === null) {
    return undefined
  }
  const env: unknown = Reflect.get(processValue, "env")
  if (typeof env !== "object" || env === null) return undefined
  const value: unknown = Reflect.get(env, name)
  return typeof value === "string" ? value : undefined
}

function isWorkersRuntime(): boolean {
  const navigatorValue: unknown = Reflect.get(globalThis, "navigator")
  if (typeof navigatorValue !== "object" || navigatorValue === null) {
    return false
  }
  return Reflect.get(navigatorValue, "userAgent") === "Cloudflare-Workers"
}

function isLogFormat(value: string | undefined): value is LogFormat {
  return value === "json" || value === "pretty"
}

function isLogLevel(value: string | undefined): value is LogLevel {
  return (
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error"
  )
}

/**
 * JSON in Workers and production Node; pretty everywhere else. `LOG_FORMAT`
 * overrides when a process environment exists.
 */
export function detectLogFormat(): LogFormat {
  const override = readProcessEnv("LOG_FORMAT")
  if (isLogFormat(override)) return override
  if (isWorkersRuntime()) return "json"
  return readProcessEnv("NODE_ENV") === "production" ? "json" : "pretty"
}

function detectLogLevel(format: LogFormat): LogLevel {
  const override = readProcessEnv("LOG_LEVEL")
  if (isLogLevel(override)) return override
  return format === "json" ? "info" : "debug"
}

function consoleSink(level: LogLevel, line: string): void {
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else if (level === "debug") console.debug(line)
  else console.log(line)
}

function formatPrettyValue(value: unknown): string {
  if (typeof value === "string") {
    return /^[^\s"=]+$/.test(value) ? value : JSON.stringify(value)
  }
  return JSON.stringify(value) ?? String(value)
}

export function formatPrettyLine(
  level: LogLevel,
  time: Date,
  message: string,
  fields: LogFields,
): string {
  const clock = time.toISOString().slice(11, 23)
  const details = Object.entries(fields)
    .map(([key, value]) => `${key}=${formatPrettyValue(value)}`)
    .join(" ")
  const head = `${clock} ${level.toUpperCase().padEnd(5)} ${message}`
  return details.length > 0 ? `${head} ${details}` : head
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const format = options.format ?? detectLogFormat()
  const threshold = levelOrder[options.level ?? detectLogLevel(format)]
  const baseFields = options.fields ?? {}
  const sink = options.sink ?? consoleSink
  const now = options.now ?? (() => new Date())

  function write(level: LogLevel, entry: LogEntry): void {
    if (levelOrder[level] < threshold) return
    const { message, ...rest } = entry
    const fields = redact({ ...baseFields, ...rest })
    const time = now()
    try {
      const line =
        format === "json"
          ? JSON.stringify({
              level,
              time: time.toISOString(),
              message,
              ...fields,
            })
          : formatPrettyLine(level, time, message, fields)
      sink(level, line)
    } catch {
      sink(level, JSON.stringify({ level, message, logError: true }))
    }
  }

  return {
    debug(entry) {
      write("debug", entry)
    },
    info(entry) {
      write("info", entry)
    },
    warn(entry) {
      write("warn", entry)
    },
    error(entry) {
      write("error", entry)
    },
    child(fields) {
      return createLogger({
        ...options,
        format,
        fields: { ...baseFields, ...fields },
      })
    },
  }
}

export const logger = createLogger()

export default logger
