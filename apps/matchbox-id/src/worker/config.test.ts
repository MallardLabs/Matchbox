import { describe, expect, it } from "vitest"
import {
  type WorkerConfig,
  type WorkerEnv,
  parseWorkerConfig,
  siweRpcUrls,
} from "./config"

const vars = {
  ENVIRONMENT: "development",
  ISSUER: "http://localhost:5180",
  PLATFORM_STORE: "memory",
  SESSION_PEPPER: "test-session-pepper-0000",
  CLIENT_SECRET_PEPPER: "test-client-secret-pepper",
  OIDC_SIGNING_KEYS: JSON.stringify([
    { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d", kid: "test-key" },
  ]),
}

function configFor(
  overrides: Omit<WorkerEnv, "ASSETS" | "RATE_LIMITER"> = {},
): WorkerConfig {
  const parsed = parseWorkerConfig({ ...vars, ...overrides })
  if (!parsed.ok) throw new Error(parsed.issues.join("; "))
  return parsed.config
}

describe("SIWE RPC configuration", () => {
  it("confirms mainnet contract signatures with other operators by default", () => {
    const config = configFor()
    expect(siweRpcUrls(config, "mezo")).toEqual([
      "https://rpc-internal.mezo.org",
      "https://rpc-http.mezo.boar.network",
      "https://mainnet.mezo.public.validationcloud.io",
    ])
    expect(siweRpcUrls(config, "mezo-testnet")).toEqual([
      "https://rpc.test.mezo.org",
    ])
  })

  it("counts each host once", () => {
    const config = configFor({
      MEZO_MAINNET_RPC_URL: "https://rpc-http.mezo.boar.network/key-a",
      MEZO_MAINNET_CONFIRMING_RPC_URLS:
        "https://rpc-http.mezo.boar.network/key-b, https://rpc.example",
      MEZO_TESTNET_CONFIRMING_RPC_URLS: "https://rpc.test.mezo.org/other",
    })
    expect(siweRpcUrls(config, "mezo")).toEqual([
      "https://rpc-http.mezo.boar.network/key-a",
      "https://rpc.example",
    ])
    expect(siweRpcUrls(config, "mezo-testnet")).toEqual([
      "https://rpc.test.mezo.org",
    ])
  })

  it("rejects a confirming RPC that is not a URL", () => {
    expect(
      parseWorkerConfig({
        ...vars,
        MEZO_MAINNET_CONFIRMING_RPC_URLS: "https://rpc.example,not a url",
      }).ok,
    ).toBe(false)
  })
})
