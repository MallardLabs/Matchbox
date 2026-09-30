import type { Logger } from "@repo/logger"

declare module "hono" {
  // Declaration merging is the only way to type middleware-provided vars.
  interface ContextVariableMap {
    requestId: string
    logger: Logger
  }
}
