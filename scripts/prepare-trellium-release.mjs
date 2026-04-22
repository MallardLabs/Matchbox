import { execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const repoRoot = process.cwd()
const boundaryScript = path.join(repoRoot, "scripts", "check-trellium-boundary.mjs")
const trelliumIgnoreFile = path.join(repoRoot, ".trelliumignore")
const args = process.argv.slice(2)

let ref = "HEAD"
let outDir = null
let force = false
let workingTree = false

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]

  if (arg === "--ref") {
    ref = args[i + 1]
    i += 1
    continue
  }

  if (arg === "--out") {
    outDir = args[i + 1]
    i += 1
    continue
  }

  if (arg === "--force") {
    force = true
    continue
  }

  if (arg === "--working-tree") {
    workingTree = true
    continue
  }

  console.error(
    "Usage: pnpm release:trellium:prepare -- [--ref <git-ref> | --working-tree] --out <dir> [--force]",
  )
  process.exit(1)
}

function sanitizeSegment(value) {
  return value.replaceAll(/[<>:"/\\|?*\s]+/g, "-")
}

const defaultOutDir = path.join(repoRoot, ".trellium-release", sanitizeSegment(ref))
const absoluteOutDir = path.resolve(repoRoot, outDir ?? defaultOutDir)
const managedReleaseRoot = path.join(repoRoot, ".trellium-release")

if (workingTree && ref !== "HEAD") {
  console.error("Use either --ref or --working-tree, not both")
  process.exit(1)
}

if (existsSync(absoluteOutDir)) {
  const isManagedReleaseDir =
    absoluteOutDir === managedReleaseRoot ||
    absoluteOutDir.startsWith(`${managedReleaseRoot}${path.sep}`)

  if (!force) {
    console.error(`Output directory already exists: ${absoluteOutDir}`)
    console.error("Pass --force to replace it.")
    process.exit(1)
  }

  if (!isManagedReleaseDir) {
    console.error("For safety, --force only works inside .trellium-release/")
    process.exit(1)
  }

  rmSync(absoluteOutDir, { recursive: true, force: true })
}

mkdirSync(absoluteOutDir, { recursive: true })

const tempArchive = path.join(
  tmpdir(),
  `trellium-release-${Date.now()}-${Math.random().toString(16).slice(2)}.tar`,
)

const ignoredPaths = readFileSync(trelliumIgnoreFile, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"))

const skippedDirectories = new Set([
  ".claude",
  ".git",
  ".next",
  ".open-next",
  ".pnpm-store",
  ".trellium-release",
  ".turbo",
  "build",
  "dist",
  "node_modules",
  "out",
])

function matchesIgnoredPath(filePath, ignoredPath) {
  if (ignoredPath.endsWith("/**")) {
    const prefix = ignoredPath.slice(0, -3)

    return filePath.startsWith(`${prefix}/`)
  }

  return filePath === ignoredPath
}

function copyWorkingTree(sourceDir, targetDir) {
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (skippedDirectories.has(entry.name)) {
      continue
    }

    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true })
      copyWorkingTree(sourcePath, targetPath)
      continue
    }

    const relativePath = path.relative(repoRoot, sourcePath).replaceAll("\\", "/")

    if (ignoredPaths.some((ignoredPath) => matchesIgnoredPath(relativePath, ignoredPath))) {
      continue
    }

    cpSync(sourcePath, targetPath, { force: true })
  }
}

try {
  if (workingTree) {
    copyWorkingTree(repoRoot, absoluteOutDir)
  } else {
    execFileSync("git", ["archive", "--format=tar", "-o", tempArchive, ref], {
      cwd: repoRoot,
      stdio: "inherit",
    })

    execFileSync("tar", ["-xf", tempArchive, "-C", absoluteOutDir], {
      cwd: repoRoot,
      stdio: "inherit",
    })
  }

  if (readdirSync(absoluteOutDir).length === 0) {
    console.error(`Release export was empty for ref ${ref}`)
    process.exit(1)
  }

  execFileSync(process.execPath, [boundaryScript, "--dir", absoluteOutDir], {
    cwd: repoRoot,
    stdio: "inherit",
  })
} finally {
  if (existsSync(tempArchive)) {
    unlinkSync(tempArchive)
  }
}

console.log("")
console.log(`Prepared Trellium release snapshot at ${absoluteOutDir}`)
console.log(
  `Next: pnpm release:trellium:publish -- --dir ${absoluteOutDir} --message "Release vX.Y.Z" --tag vX.Y.Z`,
)
