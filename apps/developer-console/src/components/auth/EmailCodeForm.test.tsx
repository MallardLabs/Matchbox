import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { cleanCode } from "./CodeInput"
import EmailCodeForm, { formatCountdown } from "./EmailCodeForm"

describe("cleanCode", () => {
  it("keeps six digits from pasted text", () => {
    expect(cleanCode("481 205")).toBe("481205")
    expect(cleanCode("48-12-05-99")).toBe("481205")
    expect(cleanCode("abc")).toBe("")
  })
})

describe("EmailCodeForm", () => {
  it("verifies as soon as the sixth digit lands and locks resend", async () => {
    const user = userEvent.setup()
    const onVerify = vi.fn()
    const onResend = vi.fn()
    render(
      <EmailCodeForm
        pending={false}
        error={null}
        onVerify={onVerify}
        onResend={onResend}
        resending={false}
        sentAt={Date.now()}
      />,
    )
    const input = screen.getByLabelText("Code")
    expect(input).toHaveAttribute("autocomplete", "one-time-code")
    await user.type(input, "48120")
    expect(onVerify).not.toHaveBeenCalled()
    await user.type(input, "5")
    expect(onVerify).toHaveBeenCalledWith("481205")
    expect(screen.getByRole("button", { name: "Resend" })).toBeDisabled()
  })

  it("accepts a pasted code with separators", () => {
    const onVerify = vi.fn()
    render(
      <EmailCodeForm
        pending={false}
        error={null}
        onVerify={onVerify}
        onResend={() => {}}
        resending={false}
        sentAt={0}
      />,
    )
    fireEvent.paste(screen.getByLabelText("Code"), {
      clipboardData: { getData: () => "481 205" },
    })
    expect(onVerify).toHaveBeenCalledWith("481205")
    expect(screen.getByRole("button", { name: "Resend" })).toBeEnabled()
  })

  it("formats the countdown", () => {
    expect(formatCountdown(42)).toBe("0:42")
    expect(formatCountdown(65)).toBe("1:05")
  })
})
