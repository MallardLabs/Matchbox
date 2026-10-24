/**
 * Google Identity Services (GIS): loads the script once and renders the
 * "Sign in with Google" button. The ID token it yields goes to the Worker,
 * which verifies it (signature, audience, nonce) before trusting anything.
 */

const scriptUrl = "https://accounts.google.com/gsi/client"

type CredentialResponse = { credential: string }

type IdConfiguration = {
  client_id: string
  callback: (response: CredentialResponse) => void
  nonce: string
  auto_select: boolean
  cancel_on_tap_outside: boolean
  context: "signin" | "use"
  itp_support: boolean
  use_fedcm_for_button: boolean
}

export type GoogleButtonText = "signin_with" | "continue_with"

type ButtonConfiguration = {
  type: "standard"
  theme: "outline" | "filled_black"
  size: "large"
  text: GoogleButtonText
  shape: "rectangular"
  logo_alignment: "left" | "center"
  width: number
}

type GoogleIdentity = {
  initialize(config: IdConfiguration): void
  renderButton(parent: HTMLElement, options: ButtonConfiguration): void
  cancel(): void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentity } }
  }
}

let loading: Promise<GoogleIdentity> | null = null

/** Resolves with `google.accounts.id`; one script tag per page. */
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  const ready = window.google?.accounts?.id
  if (ready !== undefined) return Promise.resolve(ready)
  loading ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = scriptUrl
    script.async = true
    script.onload = () => {
      const id = window.google?.accounts?.id
      if (id === undefined) reject(new Error("Google sign-in did not load."))
      else resolve(id)
    }
    script.onerror = () => {
      loading = null
      reject(new Error("Google sign-in did not load."))
    }
    document.head.append(script)
  })
  return loading
}

/** GIS button widths are whole pixels between 200 and 400. */
export function buttonWidth(containerWidth: number): number {
  return Math.max(200, Math.min(400, Math.floor(containerWidth)))
}

export async function renderGoogleButton(
  parent: HTMLElement,
  options: {
    clientId: string
    nonce: string
    purpose: "sign-in" | "step-up"
    text: GoogleButtonText
    dark: boolean
    onCredential: (credential: string) => void
  },
): Promise<void> {
  const id = await loadGoogleIdentity()
  id.initialize({
    client_id: options.clientId,
    callback: (response) => options.onCredential(response.credential),
    nonce: options.nonce,
    auto_select: false,
    cancel_on_tap_outside: true,
    context: options.purpose === "sign-in" ? "signin" : "use",
    itp_support: true,
    use_fedcm_for_button: true,
  })
  parent.replaceChildren()
  id.renderButton(parent, {
    type: "standard",
    theme: options.dark ? "filled_black" : "outline",
    size: "large",
    text: options.text,
    shape: "rectangular",
    logo_alignment: "center",
    width: buttonWidth(parent.clientWidth),
  })
}
