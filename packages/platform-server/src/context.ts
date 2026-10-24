import type { Logger } from "@repo/logger"
import type { ErrorCode } from "@repo/platform-contracts/errors"

declare module "hono" {
  // Declaration merging is the only way to type middleware-provided vars.
  interface ContextVariableMap {
    requestId: string
    logger: Logger
    /** Set by `errorResponse`; request logs record it. */
    errorCode: ErrorCode
  }
}
