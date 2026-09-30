import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import RevealSecretDialog from "./RevealSecretDialog"

const key = `mbx_sk_test_AbCdEfGhIjKl_${"x".repeat(43)}`

describe("RevealSecretDialog", () => {
  it("cannot be dismissed until the user confirms storing the key", async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(
      <RevealSecretDialog
        secret={key}
        title="API key"
        label="API key"
        noun="key"
        onDone={onDone}
      />,
    )
    const dialog = screen.getByRole("dialog", { name: "API key" })
    expect(dialog).toHaveTextContent(key)
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull()

    const done = screen.getByRole("button", { name: "Done" })
    expect(done).toBeDisabled()
    await user.keyboard("{Escape}")
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole("checkbox", { name: "I've stored this key" }),
    )
    expect(done).toBeEnabled()
    await user.click(done)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("stays closed without a secret", () => {
    render(
      <RevealSecretDialog
        secret={null}
        title="API key"
        label="API key"
        noun="key"
        onDone={() => {}}
      />,
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
