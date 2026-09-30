import {
  type AuthenticationCredential,
  type AuthenticationOptions,
  type RegistrationCredential,
  type RegistrationOptions,
  authenticationCredentialSchema,
  registrationCredentialSchema,
} from "@repo/platform-contracts/console"
import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialDescriptorJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  WebAuthnAbortService,
  WebAuthnError,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser"

/** Browser side of passkey ceremonies, validated against the contracts. */

export type PasskeyFailure = "unsupported" | "cancelled" | "exists" | "failed"

export class PasskeyError extends Error {
  readonly reason: PasskeyFailure

  constructor(reason: PasskeyFailure, message: string) {
    super(message)
    this.name = "PasskeyError"
    this.reason = reason
  }
}

const failureMessages: Record<PasskeyFailure, string> = {
  unsupported: "Passkeys are not supported in this browser.",
  cancelled: "Passkey request cancelled.",
  exists: "This passkey is already registered.",
  failed: "Passkey request failed.",
}

export function passkeysSupported(): boolean {
  return browserSupportsWebAuthn()
}

export function autofillSupported(): Promise<boolean> {
  return browserSupportsWebAuthnAutofill()
}

export function cancelPasskeyCeremony(): void {
  WebAuthnAbortService.cancelCeremony()
}

function toPasskeyError(error: unknown): PasskeyError {
  if (error instanceof PasskeyError) return error
  if (error instanceof WebAuthnError) {
    if (error.code === "ERROR_CEREMONY_ABORTED") {
      return new PasskeyError("cancelled", failureMessages.cancelled)
    }
    if (error.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
      return new PasskeyError("exists", failureMessages.exists)
    }
  }
  if (error instanceof Error) {
    if (error.name === "NotAllowedError" || error.name === "AbortError") {
      return new PasskeyError("cancelled", failureMessages.cancelled)
    }
    if (error.name === "InvalidStateError") {
      return new PasskeyError("exists", failureMessages.exists)
    }
  }
  return new PasskeyError("failed", failureMessages.failed)
}

function descriptors(
  list: RegistrationOptions["excludeCredentials"],
): PublicKeyCredentialDescriptorJSON[] | null {
  if (list === undefined) return null
  return list.map((item) => ({
    id: item.id,
    type: item.type,
    ...(item.transports === undefined ? {} : { transports: item.transports }),
  }))
}

function creationOptions(
  options: RegistrationOptions,
): PublicKeyCredentialCreationOptionsJSON {
  const exclude = descriptors(options.excludeCredentials)
  const selection = options.authenticatorSelection
  return {
    rp: {
      name: options.rp.name,
      ...(options.rp.id === undefined ? {} : { id: options.rp.id }),
    },
    user: options.user,
    challenge: options.challenge,
    pubKeyCredParams: options.pubKeyCredParams,
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(exclude === null ? {} : { excludeCredentials: exclude }),
    ...(selection === undefined
      ? {}
      : {
          authenticatorSelection: {
            ...(selection.authenticatorAttachment === undefined
              ? {}
              : { authenticatorAttachment: selection.authenticatorAttachment }),
            ...(selection.residentKey === undefined
              ? {}
              : { residentKey: selection.residentKey }),
            ...(selection.requireResidentKey === undefined
              ? {}
              : { requireResidentKey: selection.requireResidentKey }),
            ...(selection.userVerification === undefined
              ? {}
              : { userVerification: selection.userVerification }),
          },
        }),
    ...(options.attestation === undefined
      ? {}
      : { attestation: options.attestation }),
    ...(options.hints === undefined ? {} : { hints: options.hints }),
  }
}

function requestOptions(
  options: AuthenticationOptions,
): PublicKeyCredentialRequestOptionsJSON {
  const allow = descriptors(options.allowCredentials)
  return {
    challenge: options.challenge,
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options.rpId === undefined ? {} : { rpId: options.rpId }),
    ...(allow === null ? {} : { allowCredentials: allow }),
    ...(options.userVerification === undefined
      ? {}
      : { userVerification: options.userVerification }),
    ...(options.hints === undefined ? {} : { hints: options.hints }),
  }
}

export async function createPasskey(
  options: RegistrationOptions,
): Promise<RegistrationCredential> {
  if (!passkeysSupported()) {
    throw new PasskeyError("unsupported", failureMessages.unsupported)
  }
  try {
    const response = await startRegistration({
      optionsJSON: creationOptions(options),
    })
    return registrationCredentialSchema.parse(response)
  } catch (error) {
    throw toPasskeyError(error)
  }
}

export async function assertPasskey(
  options: AuthenticationOptions,
  mode: "modal" | "autofill" = "modal",
): Promise<AuthenticationCredential> {
  if (!passkeysSupported()) {
    throw new PasskeyError("unsupported", failureMessages.unsupported)
  }
  try {
    const response = await startAuthentication({
      optionsJSON: requestOptions(options),
      useBrowserAutofill: mode === "autofill",
    })
    return authenticationCredentialSchema.parse(response)
  } catch (error) {
    throw toPasskeyError(error)
  }
}
