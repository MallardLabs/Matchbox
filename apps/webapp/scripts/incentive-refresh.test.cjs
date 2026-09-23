const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const Module = require("node:module")
const path = require("node:path")
const test = require("node:test")
const React = require("react")
const { act, create } = require("react-test-renderer")
const ts = require("typescript")

test("a confirmed incentive refreshes once despite parent renders and reopening", () => {
  let transaction = { hash: "0xfirst", isSuccess: false }
  let refreshes = 0
  let closes = 0
  const refetch = async () => ({})
  const emptyComponent = () => null
  const filename = path.resolve(
    __dirname,
    "../src/components/AddGaugeIncentiveModal.tsx",
  )
  const component = new Module(filename, module)
  component.filename = filename
  component.paths = module.paths
  component.require = (name) => {
    if (name === "@/hooks/useVoting") {
      return {
        useAddIncentives: () => ({ ...transaction, addIncentives() {} }),
        useApproveToken: () => ({ reset() {} }),
        useBoostVoterAddress: () => undefined,
        useIsAllowlistedToken: () => ({ isAllowlisted: true }),
        useTokenAllowance: () => ({ refetch }),
      }
    }
    if (name === "wagmi")
      return { useAccount: () => ({}), useReadContract: () => ({ refetch }) }
    if (name === "next/router") return { useRouter: () => ({}) }
    if (name === "@mezo-org/mezo-clay") {
      return Object.fromEntries(
        ["Button", "Input", "Modal", "ModalBody", "ModalHeader"].map((key) => [
          key,
          emptyComponent,
        ]),
      )
    }
    if (name.startsWith("@/components/")) {
      return {
        __esModule: true,
        default: emptyComponent,
        TokenIcon: emptyComponent,
        TokenSelector: emptyComponent,
      }
    }
    return require(name)
  }
  component._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText,
    filename,
  )
  const { AddGaugeIncentiveModal } = component.exports
  function render(isOpen = true) {
    // The real parent creates both callbacks inline on every query-state render.
    return React.createElement(AddGaugeIncentiveModal, {
      isOpen,
      gaugeAddress: "0x0000000000000000000000000000000000000001",
      gaugeName: "Test gauge",
      totalIncentivesUsd: 0,
      gaugeHasNoVotes: false,
      onIncentivesAdded: () => {
        refreshes++
      },
      onClose: () => {
        closes++
      },
    })
  }
  let root
  try {
    act(() => {
      root = create(render())
    })
    assert.equal(refreshes, 0)
    transaction = { ...transaction, isSuccess: true }
    act(() => {
      root.update(render())
    })
    assert.equal(refreshes, 1)
    for (let index = 0; index < 5; index++)
      act(() => {
        root.update(render(false))
      })
    act(() => {
      root.update(render(true))
    })
    assert.equal(
      refreshes,
      1,
      "query updates must not re-trigger topology fetches",
    )
    assert.equal(
      closes,
      1,
      "reopening must not close the modal for the old receipt",
    )
    transaction = { hash: "0xsecond", isSuccess: false }
    act(() => {
      root.update(render())
    })
    transaction = { ...transaction, isSuccess: true }
    act(() => {
      root.update(render())
    })
    assert.equal(
      refreshes,
      2,
      "a second confirmed transaction gets its own refresh",
    )
  } finally {
    act(() => {
      root?.unmount()
    })
  }
})
