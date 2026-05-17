const Module = require("node:module")
const path = require("node:path")

const baseDir = process.env.TEST_OUT_DIR
if (!baseDir) {
  throw new Error("TEST_OUT_DIR env var is required for the test loader")
}

const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, ...rest) {
  if (typeof request === "string" && request.startsWith("@/")) {
    const mapped = path.join(baseDir, request.slice(2))
    return origResolve.call(this, mapped, parent, ...rest)
  }
  return origResolve.call(this, request, parent, ...rest)
}
