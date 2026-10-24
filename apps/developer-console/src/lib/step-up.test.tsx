import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { ApiError } from "./api-client"
import {
  StepUpCancelledError,
  type StepUpControl,
  StepUpProvider,
  useStepUp,
} from "./step-up"

function stepUpRequired(): ApiError {
  return new ApiError({
    status: 403,
    code: "step_up_required",
    message: "Confirm with Google to continue.",
    requestId: "req_1",
  })
}

/** Stands in for the GIS button: yields a fixed credential. */
const FakeGoogle: StepUpControl = ({ onCredential, onError }) => (
  <button
    type="button"
    onClick={() => {
      onCredential("google-id-token").catch((error: Error) =>
        onError(error.message),
      )
    }}
  >
    Google
  </button>
)

function Harness({
  action,
  onResult,
}: {
  action: () => Promise<string>
  onResult: (result: unknown) => void
}): ReactElement {
  const stepUp = useStepUp()
  return (
    <button
      type="button"
      onClick={() => {
        stepUp.run(action).then(onResult, onResult)
      }}
    >
      Run
    </button>
  )
}

describe("useStepUp", () => {
  it("prompts once on step_up_required, verifies, then retries", async () => {
    const user = userEvent.setup()
    const action = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(stepUpRequired())
      .mockResolvedValueOnce("created")
    const verify = vi.fn(async (_credential: string) => {})
    const onResult = vi.fn()
    render(
      <StepUpProvider
        verify={verify}
        control={FakeGoogle}
        allowDevStepUp={false}
      >
        <Harness action={action} onResult={onResult} />
      </StepUpProvider>,
    )
    await user.click(screen.getByRole("button", { name: "Run" }))
    expect(
      await screen.findByRole("dialog", { name: "Confirm with Google" }),
    ).toBeInTheDocument()
    expect(action).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole("button", { name: "Google" }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("created"))
    expect(verify).toHaveBeenCalledWith("google-id-token")
    expect(action).toHaveBeenCalledTimes(2)
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
  })

  it("does not prompt for other errors", async () => {
    const user = userEvent.setup()
    const conflict = new ApiError({
      status: 409,
      code: "conflict",
      message: "Conflict",
      requestId: null,
    })
    const action = vi.fn<() => Promise<string>>().mockRejectedValue(conflict)
    const onResult = vi.fn()
    render(
      <StepUpProvider
        verify={async () => {}}
        control={FakeGoogle}
        allowDevStepUp={false}
      >
        <Harness action={action} onResult={onResult} />
      </StepUpProvider>,
    )
    await user.click(screen.getByRole("button", { name: "Run" }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(conflict))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("rejects with StepUpCancelledError when dismissed, without retrying", async () => {
    const user = userEvent.setup()
    const action = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(stepUpRequired())
    const onResult = vi.fn()
    render(
      <StepUpProvider
        verify={async () => {}}
        control={FakeGoogle}
        allowDevStepUp={false}
      >
        <Harness action={action} onResult={onResult} />
      </StepUpProvider>,
    )
    await user.click(screen.getByRole("button", { name: "Run" }))
    await screen.findByRole("dialog")
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(onResult).toHaveBeenCalled())
    expect(onResult.mock.calls[0]?.[0]).toBeInstanceOf(StepUpCancelledError)
    expect(action).toHaveBeenCalledTimes(1)
  })

  it("shows verification errors inline and allows another attempt", async () => {
    const user = userEvent.setup()
    const action = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(stepUpRequired())
      .mockResolvedValueOnce("ok")
    const verify = vi
      .fn(async (_credential: string) => {})
      .mockRejectedValueOnce(new Error("Google sign-in failed."))
    const onResult = vi.fn()
    render(
      <StepUpProvider
        verify={verify}
        control={FakeGoogle}
        allowDevStepUp={false}
      >
        <Harness action={action} onResult={onResult} />
      </StepUpProvider>,
    )
    await user.click(screen.getByRole("button", { name: "Run" }))
    await user.click(await screen.findByRole("button", { name: "Google" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google sign-in failed.",
    )
    await user.click(screen.getByRole("button", { name: "Google" }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("ok"))
  })
})
