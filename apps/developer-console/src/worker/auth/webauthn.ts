import {
  type AuthenticationCredential,
  type AuthenticationOptions,
  type RegistrationCredential,
  type RegistrationOptions,
  authenticationOptionsSchema,
  registrationOptionsSchema,
} from "@repo/platform-contracts/console"
import {
  base64UrlDecode,
  base64UrlEncode,
  utf8Encode,
} from "@repo/platform-contracts/encoding"
import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import type {
  AuthenticatorTransport,
  PasskeyDeviceType,
  PasskeyRecord,
} from "../store/console-store"

/**
 * Thin boundary over `@simplewebauthn/server` so routes deal in contract
 * shapes and tests can mock the verify functions at the module boundary.
 * Sign-in and registration ask for user verification ("preferred") and
 * report whether it happened; step-up requires it ("required"), and only a
 * user-verified ceremony may yield a stepped-up session.
 */

export type WebauthnConfig = {
  rpId: string
  rpName: string
  origin: string
}

export const webauthnTimeoutMs = 300_000

export async function createRegistrationOptions(input: {
  config: WebauthnConfig
  account: { id: string; email: string; displayName: string }
  existing: Pick<PasskeyRecord, "credentialId" | "transports">[]
}): Promise<RegistrationOptions> {
  const options = await generateRegistrationOptions({
    rpName: input.config.rpName,
    rpID: input.config.rpId,
    userName: input.account.email,
    userDisplayName: input.account.displayName,
    userID: new Uint8Array(utf8Encode(input.account.id)),
    timeout: webauthnTimeoutMs,
    attestationType: "none",
    excludeCredentials: input.existing.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports,
    })),
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "preferred",
    },
  })
  return registrationOptionsSchema.parse(options)
}

export type UserVerification = "required" | "preferred"

export async function createAuthenticationOptions(input: {
  config: WebauthnConfig
  /** Empty for discoverable sign-in (conditional UI). */
  allow: Pick<PasskeyRecord, "credentialId" | "transports">[]
  userVerification: UserVerification
}): Promise<AuthenticationOptions> {
  const options = await generateAuthenticationOptions({
    rpID: input.config.rpId,
    timeout: webauthnTimeoutMs,
    userVerification: input.userVerification,
    allowCredentials: input.allow.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports,
    })),
  })
  return authenticationOptionsSchema.parse(options)
}

function toRegistrationResponse(
  credential: RegistrationCredential,
): RegistrationResponseJSON {
  const response: RegistrationResponseJSON["response"] = {
    clientDataJSON: credential.response.clientDataJSON,
    attestationObject: credential.response.attestationObject,
  }
  if (credential.response.authenticatorData !== undefined) {
    response.authenticatorData = credential.response.authenticatorData
  }
  if (credential.response.transports !== undefined) {
    response.transports = credential.response.transports
  }
  if (credential.response.publicKeyAlgorithm !== undefined) {
    response.publicKeyAlgorithm = credential.response.publicKeyAlgorithm
  }
  if (credential.response.publicKey !== undefined) {
    response.publicKey = credential.response.publicKey
  }
  const json: RegistrationResponseJSON = {
    id: credential.id,
    rawId: credential.rawId,
    type: credential.type,
    response,
    clientExtensionResults: {},
  }
  if (credential.authenticatorAttachment !== undefined) {
    json.authenticatorAttachment = credential.authenticatorAttachment
  }
  return json
}

function toAuthenticationResponse(
  credential: AuthenticationCredential,
): AuthenticationResponseJSON {
  const response: AuthenticationResponseJSON["response"] = {
    clientDataJSON: credential.response.clientDataJSON,
    authenticatorData: credential.response.authenticatorData,
    signature: credential.response.signature,
  }
  if (credential.response.userHandle !== undefined) {
    response.userHandle = credential.response.userHandle
  }
  const json: AuthenticationResponseJSON = {
    id: credential.id,
    rawId: credential.rawId,
    type: credential.type,
    response,
    clientExtensionResults: {},
  }
  if (credential.authenticatorAttachment !== undefined) {
    json.authenticatorAttachment = credential.authenticatorAttachment
  }
  return json
}

function deviceType(value: "singleDevice" | "multiDevice"): PasskeyDeviceType {
  return value === "multiDevice" ? "multi-device" : "single-device"
}

export type VerifiedPasskey = {
  credentialId: string
  publicKey: string
  counter: number
  transports: AuthenticatorTransport[]
  deviceType: PasskeyDeviceType
  backedUp: boolean
  userVerified: boolean
}

/** Null when the attestation does not verify (details are not exposed). */
export async function verifyRegistration(input: {
  config: WebauthnConfig
  credential: RegistrationCredential
  expectedChallenge: string
}): Promise<VerifiedPasskey | null> {
  let result: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    result = await verifyRegistrationResponse({
      response: toRegistrationResponse(input.credential),
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: input.config.origin,
      expectedRPID: input.config.rpId,
      requireUserVerification: false,
    })
  } catch {
    return null
  }
  if (!result.verified) return null
  const info = result.registrationInfo
  return {
    credentialId: info.credential.id,
    publicKey: base64UrlEncode(info.credential.publicKey),
    counter: info.credential.counter,
    transports:
      info.credential.transports ?? input.credential.response.transports ?? [],
    deviceType: deviceType(info.credentialDeviceType),
    backedUp: info.credentialBackedUp,
    userVerified: info.userVerified,
  }
}

export type VerifiedAssertion = {
  newCounter: number
  deviceType: PasskeyDeviceType
  backedUp: boolean
  userVerified: boolean
}

export async function verifyAuthentication(input: {
  config: WebauthnConfig
  credential: AuthenticationCredential
  expectedChallenge: string
  passkey: PasskeyRecord
  /** True for step-up: the assertion must carry the UV flag. */
  requireUserVerification: boolean
}): Promise<VerifiedAssertion | null> {
  const publicKey = base64UrlDecode(input.passkey.publicKey)
  if (publicKey === null) return null
  let result: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  try {
    result = await verifyAuthenticationResponse({
      response: toAuthenticationResponse(input.credential),
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: input.config.origin,
      expectedRPID: input.config.rpId,
      requireUserVerification: input.requireUserVerification,
      credential: {
        id: input.passkey.credentialId,
        publicKey: new Uint8Array(publicKey),
        counter: input.passkey.counter,
        transports: input.passkey.transports,
      },
    })
  } catch {
    return null
  }
  if (!result.verified) return null
  return {
    newCounter: result.authenticationInfo.newCounter,
    deviceType: deviceType(result.authenticationInfo.credentialDeviceType),
    backedUp: result.authenticationInfo.credentialBackedUp,
    userVerified: result.authenticationInfo.userVerified,
  }
}
