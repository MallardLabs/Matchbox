import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type ReactElement, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as AlertDialog from "./alert-dialog"
import * as Button from "./button"
import { cn } from "./cn"
import * as CopyField from "./copy-field"
import * as Field from "./field"
import * as Fieldset from "./fieldset"
import * as Input from "./input"
import * as KeyValue from "./key-value"
import * as SegmentedControl from "./segmented-control"
import { shortenAddress } from "./wallet-address"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("cn", () => {
  it("keeps font family next to custom numeric weights", () => {
    expect(cn("font-mono font-500", "font-650")).toBe("font-mono font-650")
  })

  it("lets className override variant weights inside tv styles", () => {
    const classes = Button.buttonStyles({
      variant: "secondary",
      className: "font-mono font-500",
    }).split(" ")
    expect(classes).toContain("font-500")
    expect(classes).toContain("font-mono")
    expect(classes).not.toContain("font-600")
  })
})

describe("Button", () => {
  it("disables and marks busy while loading", async () => {
    const onClick = vi.fn()
    render(
      <Button.Root loading onClick={onClick}>
        Save
      </Button.Root>,
    )
    const button = screen.getByRole("button", { name: "Save" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("defaults to type=button and renders a child with asChild", () => {
    render(
      <>
        <Button.Root>Plain</Button.Root>
        <Button.Root asChild variant="secondary">
          <a href="/apps">Apps</a>
        </Button.Root>
      </>,
    )
    expect(screen.getByRole("button", { name: "Plain" })).toHaveAttribute(
      "type",
      "button",
    )
    const link = screen.getByRole("link", { name: "Apps" })
    expect(link).toHaveAttribute("href", "/apps")
    expect(link.className).toContain("border-line")
  })
})

describe("Field", () => {
  it("wires label, description and error onto the control", () => {
    render(
      <Fieldset.Root>
        <Fieldset.Legend>App</Fieldset.Legend>
        <Fieldset.Fields>
          <Field.Root required>
            <Field.Label>Website</Field.Label>
            <Field.Control>
              <Input.Root />
            </Field.Control>
            <Field.Description>Public URL</Field.Description>
            <Field.Error>Use https</Field.Error>
          </Field.Root>
        </Fieldset.Fields>
      </Fieldset.Root>,
    )
    const input = screen.getByLabelText("Website")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("aria-required", "true")
    expect(input).toHaveAccessibleDescription("Public URL Use https")
    expect(screen.getByRole("group", { name: "App" })).toBeInTheDocument()
    expect(screen.getByRole("listitem")).toContainElement(input)
  })

  it("drops the error wiring when the message clears", () => {
    function Example(): ReactElement {
      const [error, setError] = useState("Required")
      return (
        <Field.Root>
          <Field.Label>Name</Field.Label>
          <Field.Control>
            <Input.Root onChange={() => setError("")} />
          </Field.Control>
          <Field.Error>{error}</Field.Error>
        </Field.Root>
      )
    }
    render(<Example />)
    const input = screen.getByLabelText("Name")
    expect(input).toHaveAttribute("aria-invalid", "true")
    act(() => {
      input.focus()
    })
    return userEvent.type(input, "a").then(() => {
      expect(input).not.toHaveAttribute("aria-invalid")
      expect(input).not.toHaveAttribute("aria-describedby")
    })
  })
})

describe("CopyField", () => {
  it("copies the full value and announces it", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const value = "mbx_sk_live_9f2c4e7a1b3d5f60718293a4b5c6d7e8"
    render(<CopyField.Root label="secret key" value={value} />)
    expect(screen.getByText(value)).toHaveAttribute("title", value)
    await user.click(screen.getByRole("button", { name: "Copy secret key" }))
    expect(writeText).toHaveBeenCalledWith(value)
    expect(await screen.findByText("secret key: Copied")).toBeInTheDocument()
  })
})

describe("KeyValue", () => {
  it("renders an em dash for missing values", () => {
    render(
      <KeyValue.Root>
        <KeyValue.Item>
          <KeyValue.Term>Last used</KeyValue.Term>
          <KeyValue.Value>{null}</KeyValue.Value>
        </KeyValue.Item>
      </KeyValue.Root>,
    )
    expect(screen.getByRole("definition")).toHaveTextContent("—")
  })
})

describe("SegmentedControl", () => {
  it("never deselects the active option", async () => {
    const onValueChange = vi.fn()
    render(
      <SegmentedControl.Root
        aria-label="Environment"
        value="test"
        onValueChange={onValueChange}
      >
        <SegmentedControl.Item value="test">Test</SegmentedControl.Item>
        <SegmentedControl.Item value="live">Live</SegmentedControl.Item>
      </SegmentedControl.Root>,
    )
    await userEvent.click(screen.getByRole("radio", { name: "Test" }))
    expect(onValueChange).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("radio", { name: "Live" }))
    expect(onValueChange).toHaveBeenCalledWith("live")
  })
})

describe("AlertDialog", () => {
  it("focuses cancel on open and restores focus when opened programmatically", async () => {
    const user = userEvent.setup()
    function Example(): ReactElement {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Revoke key
          </button>
          <AlertDialog.Root open={open} onOpenChange={setOpen}>
            <AlertDialog.Content>
              <AlertDialog.Title>Revoke key?</AlertDialog.Title>
              <AlertDialog.Description>
                Cannot be undone
              </AlertDialog.Description>
              <AlertDialog.Footer>
                <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
                <AlertDialog.Action>Revoke</AlertDialog.Action>
              </AlertDialog.Footer>
            </AlertDialog.Content>
          </AlertDialog.Root>
        </>
      )
    }
    render(<Example />)
    const opener = screen.getByRole("button", { name: "Revoke key" })
    await user.click(opener)
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveAccessibleName("Revoke key?")
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})

describe("shortenAddress", () => {
  it("keeps 0x + 4 and the last 4 characters", () => {
    expect(shortenAddress("0x8f3cf7ad23cd3cadbd9735aff958023239c6a063")).toBe(
      "0x8f3c…a063",
    )
    expect(shortenAddress("0x1234")).toBe("0x1234")
  })
})
