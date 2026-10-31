import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import ts from "typescript"

// Without a chainId, wagmi signs on whatever chain the wallet is on and polls
// the receipt there too, so the UI can show one network while the transaction
// lands, and reports success, on another.
const CHAIN_BOUND_CALLS = new Set([
  "writeContract",
  "writeContractAsync",
  "sendTransaction",
  "sendTransactionAsync",
  "useWaitForTransactionReceipt",
])

const SRC_DIR = path.join(process.cwd(), "src")

type ChainBoundCall = {
  location: string
  hasChainId: boolean
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(entryPath)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [entryPath]
      : []
  })
}

function getCalleeName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return undefined
}

// Only an explicit `chainId` key counts. A spread can hide a missing chainId.
function hasChainIdKey(argument: ts.Expression | undefined): boolean {
  return (
    argument !== undefined &&
    ts.isObjectLiteralExpression(argument) &&
    argument.properties.some(
      (property) =>
        (ts.isPropertyAssignment(property) ||
          ts.isShorthandPropertyAssignment(property)) &&
        property.name.getText() === "chainId",
    )
  )
}

function findChainBoundCalls(filePath: string): ChainBoundCall[] {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const calls: ChainBoundCall[] = []

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const name = getCalleeName(node.expression)
      if (name !== undefined && CHAIN_BOUND_CALLS.has(name)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart())
        calls.push({
          location: `${path.relative(SRC_DIR, filePath)}:${line + 1}`,
          hasChainId: hasChainIdKey(node.arguments[0]),
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return calls
}

test("every wallet write and receipt wait passes the UI network's chainId", () => {
  const calls = listSourceFiles(SRC_DIR).flatMap(findChainBoundCalls)

  // Fails loudly if the scan stops finding the call sites at all.
  assert.ok(calls.length >= 30, `found only ${calls.length} wallet calls`)
  assert.deepEqual(
    calls.filter((call) => !call.hasChainId).map((call) => call.location),
    [],
  )
})
