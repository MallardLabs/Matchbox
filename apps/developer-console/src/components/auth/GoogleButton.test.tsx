import { ThemeProvider } from "@repo/ui/theme"
import { act, render, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { setFetch } from "../../lib/api-client"
import GoogleButton from "./GoogleButton"

let restoreFetch: (() => void) | null = null
let nonceRequests = 0
let initializedNonces: string[] = []

/** Stands in for the Worker: every nonce request answers `n<count>`. */
function serveNonces(): void {
  nonceRequests = 0
  restoreFetch = setFetch(async (input) => {
    if (input !== "/api/auth/google/nonce") throw new Error(input)
    nonceRequests += 1
    return Response.json({
      clientId: "client.apps.googleusercontent.com",
      nonce: `n${nonceRequests}`,
      expiresAt: "2026-10-26T18:00:00.000Z",
    })
  })
}

function renderButton() {
  return render(
    <StrictMode>
      <ThemeProvider>
        <GoogleButton
          purpose="sign-in"
          onCredential={async () => {}}
          onError={() => {}}
        />
      </ThemeProvider>
    </StrictMode>,
  )
}

beforeEach(() => {
  initializedNonces = []
  window.google = {
    accounts: {
      id: {
        initialize(config: { nonce: string }) {
          initializedNonces.push(config.nonce)
        },
        renderButton() {},
        cancel() {},
      },
    },
  }
  serveNonces()
})

afterEach(() => {
  restoreFetch?.()
  restoreFetch = null
  Reflect.deleteProperty(window, "google")
  vi.restoreAllMocks()
})

describe("GoogleButton", () => {
  it("arms the button with one nonce when effects run twice", async () => {
    renderButton()
    await waitFor(() => expect(initializedNonces).not.toHaveLength(0))
    expect(nonceRequests).toBe(1)
    expect(new Set(initializedNonces)).toEqual(new Set(["n1"]))
  })

  it("re-arms when the page comes back after the nonce went stale", async () => {
    const start = Date.now()
    const clock = vi.spyOn(Date, "now").mockReturnValue(start)
    renderButton()
    await waitFor(() => expect(initializedNonces).toContain("n1"))

    clock.mockReturnValue(start + 60_000)
    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    expect(nonceRequests).toBe(1)

    clock.mockReturnValue(start + 9 * 60_000)
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await waitFor(() => expect(initializedNonces.at(-1)).toBe("n2"))
    expect(nonceRequests).toBe(2)
  })
})
