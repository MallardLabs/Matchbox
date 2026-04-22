import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs"
import path from "node:path"

const repoRoot = process.cwd()
const ignoreFile = path.join(repoRoot, ".trelliumignore")

if (!existsSync(ignoreFile)) {
  console.error("Missing .trelliumignore in repo root")
  process.exit(1)
}

const ignoredPaths = readFileSync(ignoreFile, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"))
const skippedDirectories = new Set([
  ".claude",
  ".git",
  ".next",
  ".open-next",
  ".pnpm-store",
  ".turbo",
  "build",
  "dist",
  "node_modules",
  "out",
])

const args = process.argv.slice(2)
let ref = null
let dir = null

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]

  if (arg === "--ref") {
    ref = args[i + 1]
    i += 1
    continue
  }

  if (arg === "--dir") {
    dir = args[i + 1]
    i += 1
    continue
  }

  console.error(`Unknown argument: ${arg}`)
  console.error(
    "Usage: pnpm check:trellium [--ref <git-ref>] [--dir <path>]",
  )
  process.exit(1)
}

if (ref && dir) {
  console.error("Use either --ref or --dir, not both")
  process.exit(1)
}

function listTreeFiles(rootDir) {
  const results = []

  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name)
      const relativePath = path.relative(rootDir, absolutePath).replaceAll("\\", "/")

      if (entry.isDirectory()) {
        if (skippedDirectories.has(relativePath)) {
          continue
        }

        walk(absolutePath)
        continue
      }

      results.push(relativePath)
    }
  }

  walk(rootDir)

  return results
}

function listRefFiles(targetRef) {
  const output = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", targetRef],
    { cwd: repoRoot, encoding: "utf8" },
  )

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function matchesIgnoredPath(filePath, ignoredPath) {
  if (ignoredPath.endsWith("/**")) {
    const prefix = ignoredPath.slice(0, -3)

    return filePath.startsWith(`${prefix}/`)
  }

  return filePath === ignoredPath
}

let filesToCheck
let targetLabel

if (dir) {
  const absoluteDir = path.resolve(repoRoot, dir)

  if (!existsSync(absoluteDir) || !statSync(absoluteDir).isDirectory()) {
    console.error(`Directory not found: ${absoluteDir}`)
    process.exit(1)
  }

  filesToCheck = listTreeFiles(absoluteDir)
  targetLabel = absoluteDir
} else if (ref) {
  const targetRef = ref ?? "HEAD"
  filesToCheck = listRefFiles(targetRef)
  targetLabel = `git ref ${targetRef}`
} else {
  filesToCheck = listTreeFiles(repoRoot)
  targetLabel = `${repoRoot} (working tree)`
}

const forbiddenMatches = filesToCheck.filter((filePath) =>
  ignoredPaths.some((ignoredPath) => matchesIgnoredPath(filePath, ignoredPath)),
)

if (forbiddenMatches.length > 0) {
  console.error(`Trellium release boundary check failed for ${targetLabel}`)
  console.error("These dev-only files must not be promoted to Trellium:")

  for (const match of forbiddenMatches) {
    console.error(`- ${match}`)
  }

  console.error("")
  console.error("Prepare a curated release candidate that excludes .trelliumignore paths.")
  process.exit(1)
}

console.log(`Trellium release boundary check passed for ${targetLabel}`)
