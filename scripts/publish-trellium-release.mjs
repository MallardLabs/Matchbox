import { execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const repoRoot = process.cwd()
const boundaryScript = path.join(repoRoot, "scripts", "check-trellium-boundary.mjs")
const args = process.argv.slice(2)

let releaseDir = null
let remote = "trellium"
let remoteUrl = null
let branch = "main"
let message = null
let tag = null

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]

  if (arg === "--dir") {
    releaseDir = args[i + 1]
    i += 1
    continue
  }

  if (arg === "--remote") {
    remote = args[i + 1]
    i += 1
    continue
  }

  if (arg === "--remote-url") {
    remoteUrl = args[i + 1]
    i += 1
    continue
  }

  if (arg === "--branch") {
    branch = args[i + 1]
    i += 1
    continue
  }

  if (arg === "--message") {
    message = args[i + 1]
    i += 1
    continue
  }

  if (arg === "--tag") {
    tag = args[i + 1]
    i += 1
    continue
  }

  console.error(
    "Usage: pnpm release:trellium:publish -- --dir <dir> [--remote trellium] [--branch main] [--message \"Release vX.Y.Z\"] [--tag vX.Y.Z] [--remote-url <url>]",
  )
  process.exit(1)
}

if (!releaseDir) {
  console.error("Missing required --dir argument")
  process.exit(1)
}

const absoluteReleaseDir = path.resolve(repoRoot, releaseDir)

if (!existsSync(absoluteReleaseDir)) {
  console.error(`Release directory not found: ${absoluteReleaseDir}`)
  process.exit(1)
}

if (existsSync(path.join(absoluteReleaseDir, ".git"))) {
  console.error("Release directory must be an exported snapshot, not a Git repo")
  process.exit(1)
}

execFileSync(process.execPath, [boundaryScript, "--dir", absoluteReleaseDir], {
  cwd: repoRoot,
  stdio: "inherit",
})

const targetRemoteUrl =
  remoteUrl ??
  execFileSync("git", ["remote", "get-url", remote], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim()

const commitMessage = message ?? `Release snapshot from ${path.basename(absoluteReleaseDir)}`
const tempWorkspace = mkdtempSync(path.join(tmpdir(), "trellium-publish-"))

function runGit(commandArgs, cwd) {
  return execFileSync("git", commandArgs, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function syncGitIdentity(targetDir) {
  for (const key of ["user.name", "user.email"]) {
    try {
      const value = runGit(["config", "--get", key], repoRoot)

      if (value) {
        runGit(["config", key, value], targetDir)
      }
    } catch {}
  }
}

function clearDirectoryExceptGit(targetDir) {
  for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
    if (entry.name === ".git") {
      continue
    }

    rmSync(path.join(targetDir, entry.name), { recursive: true, force: true })
  }
}

function copySnapshotIntoTarget(sourceDir, targetDir) {
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    cpSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name), {
      recursive: true,
      force: true,
    })
  }
}

try {
  const hasRemoteBranch =
    runGit(["ls-remote", "--heads", targetRemoteUrl, branch], repoRoot).length > 0

  if (hasRemoteBranch) {
    runGit(["clone", "--branch", branch, "--single-branch", targetRemoteUrl, tempWorkspace], repoRoot)
  } else {
    mkdirSync(tempWorkspace, { recursive: true })
    runGit(["init", "--initial-branch", branch], tempWorkspace)
    runGit(["remote", "add", "origin", targetRemoteUrl], tempWorkspace)
  }

  syncGitIdentity(tempWorkspace)
  clearDirectoryExceptGit(tempWorkspace)
  copySnapshotIntoTarget(absoluteReleaseDir, tempWorkspace)

  runGit(["add", "-A"], tempWorkspace)

  const pendingChanges = runGit(["status", "--short"], tempWorkspace)

  if (pendingChanges.length > 0) {
    runGit(["commit", "-m", commitMessage], tempWorkspace)
    runGit(["push", "-u", "origin", branch], tempWorkspace)
  } else {
    console.log("No content changes detected in the Trellium snapshot")
  }

  if (tag) {
    const existingTag = runGit(["tag", "--list", tag], tempWorkspace)

    if (existingTag) {
      console.error(`Tag already exists locally in publish workspace: ${tag}`)
      process.exit(1)
    }

    runGit(["tag", tag], tempWorkspace)
    runGit(["push", "origin", tag], tempWorkspace)
  }
} finally {
  rmSync(tempWorkspace, { recursive: true, force: true })
}

console.log("")
console.log(`Published ${absoluteReleaseDir} to ${targetRemoteUrl}`)
if (tag) {
  console.log(`Pushed tag ${tag}`)
}
