import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import ts from "typescript"

// Without a chainId, wagmi signs on whatever chain the wallet is on and polls
// the receipt there too, so the UI can show one network while the transaction
// lands, and reports success, on another. The batch and sequential paths sign
// and poll through clients from usePublicClient / useWalletClient, so those
// must be pinned as well.
const CHAIN_BOUND_CALLS = new Set([
  "writeContract",
  "writeContractAsync",
  "sendTransaction",
  "sendTransactionAsync",
  "useWaitForTransactionReceipt",
  "usePublicClient",
  "useWalletClient",
])

// viem actions that take the client as their first argument.
const CLIENT_ACTIONS = new Set(["sendCalls", "waitForCallsStatus"])
// Client methods that act on the client's own chain.
const CLIENT_METHODS = new Set(["waitForTransactionReceipt"])

// wagmi's write hooks, which must only be used through useGatedWalletWrites.
const WAGMI_WRITE_HOOKS = new Set(["useWriteContract", "useSendTransaction"])
const GATED_WRITES_FILE = path.join("hooks", "useGatedWalletWrites.ts")

const SRC_DIR = path.join(process.cwd(), "src")

type SourceCall = {
  name: string
  location: string
  node: ts.CallExpression
}

type ParsedFile = {
  relativePath: string
  calls: SourceCall[]
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

function findObjectKey(
  argument: ts.Expression | undefined,
  key: string,
): ts.ObjectLiteralElementLike | undefined {
  if (argument === undefined || !ts.isObjectLiteralExpression(argument)) {
    return undefined
  }
  return argument.properties.find(
    (property) =>
      (ts.isPropertyAssignment(property) ||
        ts.isShorthandPropertyAssignment(property)) &&
      property.name.getText() === key,
  )
}

// Only an explicit `chainId` key counts. A spread can hide a missing chainId.
function hasChainIdKey(argument: ts.Expression | undefined): boolean {
  return findObjectKey(argument, "chainId") !== undefined
}

function hasOnMutateGate(argument: ts.Expression | undefined): boolean {
  const mutation = findObjectKey(argument, "mutation")
  return (
    mutation !== undefined &&
    ts.isPropertyAssignment(mutation) &&
    findObjectKey(mutation.initializer, "onMutate") !== undefined
  )
}

function parseSourceFile(filePath: string): ParsedFile {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const relativePath = path.relative(SRC_DIR, filePath)
  const calls: SourceCall[] = []

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const name = getCalleeName(node.expression)
      if (name !== undefined) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart())
        calls.push({ name, location: `${relativePath}:${line + 1}`, node })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return { relativePath, calls }
}

// Names bound from a chain-pinned client hook, e.g.
// `const publicClient = usePublicClient({ chainId })` or
// `const { data: walletClient } = useWalletClient({ chainId })`.
function findPinnedClientNames(file: ParsedFile): Set<string> {
  const names = new Set<string>()
  for (const call of file.calls) {
    if (call.name !== "usePublicClient" && call.name !== "useWalletClient") {
      continue
    }
    if (!hasChainIdKey(call.node.arguments[0])) continue
    const declaration = call.node.parent
    if (!ts.isVariableDeclaration(declaration)) continue
    if (ts.isIdentifier(declaration.name)) {
      names.add(declaration.name.text)
    } else if (ts.isObjectBindingPattern(declaration.name)) {
      for (const element of declaration.name.elements) {
        const key = element.propertyName?.getText() ?? element.name.getText()
        if (key === "data" && ts.isIdentifier(element.name)) {
          names.add(element.name.text)
        }
      }
    }
  }
  return names
}

function getClientName(expression: ts.Expression | undefined): string {
  if (expression === undefined) return "<none>"
  if (ts.isIdentifier(expression)) return expression.text
  return expression.getText()
}

const parsedFiles = listSourceFiles(SRC_DIR).map(parseSourceFile)

test("every wallet write and receipt wait passes the UI network's chainId", () => {
  const calls = parsedFiles.flatMap((file) =>
    file.calls.filter((call) => CHAIN_BOUND_CALLS.has(call.name)),
  )

  // Fails loudly if the scan stops finding the call sites at all.
  assert.ok(calls.length >= 30, `found only ${calls.length} wallet calls`)
  assert.deepEqual(
    calls
      .filter((call) => !hasChainIdKey(call.node.arguments[0]))
      .map((call) => call.location),
    [],
  )
})

test("batched calls and receipt polls go through chain-pinned clients", () => {
  const unpinned: string[] = []
  let checked = 0

  for (const file of parsedFiles) {
    const pinned = findPinnedClientNames(file)
    for (const call of file.calls) {
      let client: ts.Expression | undefined
      if (CLIENT_ACTIONS.has(call.name)) {
        client = call.node.arguments[0]
      } else if (
        CLIENT_METHODS.has(call.name) &&
        ts.isPropertyAccessExpression(call.node.expression)
      ) {
        client = call.node.expression.expression
      } else {
        continue
      }
      checked++
      const clientName = getClientName(client)
      if (!pinned.has(clientName)) {
        unpinned.push(`${call.location} (${clientName})`)
      }
    }
  }

  assert.ok(checked >= 10, `found only ${checked} batch or receipt calls`)
  assert.deepEqual(unpinned, [])
})

// The chainId pin is only as strict as the connector's client for that chain:
// OrangeKit relays through its smart account on its own chain. The gated hooks
// ask the connector for its chain before each signing request.
test("wagmi write hooks are only used through the wrong-network gate", () => {
  const writeHookCalls = parsedFiles.flatMap((file) =>
    file.calls
      .filter((call) => WAGMI_WRITE_HOOKS.has(call.name))
      .map((call) => ({ ...call, relativePath: file.relativePath })),
  )

  assert.ok(
    writeHookCalls.some((call) => call.relativePath === GATED_WRITES_FILE),
    "the gated write hooks were not found",
  )
  assert.deepEqual(
    writeHookCalls
      .filter(
        (call) =>
          call.relativePath !== GATED_WRITES_FILE ||
          !hasOnMutateGate(call.node.arguments[0]),
      )
      .map((call) => call.location),
    [],
  )
})
