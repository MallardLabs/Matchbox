type LogFields = Record<string, unknown>

function write(level: "info" | "error", fields: LogFields): void {
  const entry = JSON.stringify({ level, timestamp: new Date().toISOString(), ...fields })
  if (level === "error") console.error(entry)
  else console.info(entry)
}

export const structuredLogger = {
  info(fields: LogFields): void {
    write("info", fields)
  },
  error(fields: LogFields): void {
    write("error", fields)
  },
}
