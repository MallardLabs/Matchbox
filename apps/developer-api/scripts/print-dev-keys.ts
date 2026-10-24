import { createLogger } from "@repo/logger"
import { devApiKeys, devOrigins } from "../src/store/memory-seed"

/**
 * Prints the deterministic API keys served by `PLATFORM_STORE=memory`
 * (`pnpm dev:memory`). They only exist in memory mode.
 */
const log = createLogger({ format: "pretty", level: "info" })

log.info({ message: "Memory-mode API keys (PLATFORM_STORE=memory only)" })
for (const [name, value] of Object.entries(devApiKeys)) {
  log.info({ message: name, value })
}
log.info({
  message: "Registered origins for publishable keys",
  test: devOrigins.test,
  live: devOrigins.live,
})
