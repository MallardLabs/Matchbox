import { randomBytes } from "node:crypto"
import { signingJwksSchema } from "@repo/platform-contracts/oidc"
import { exportJWK, generateKeyPair } from "jose"

/**
 * Prints a fresh `OIDC_SIGNING_KEYS` value: a JSON array holding one private
 * ES256 JWK. To rotate, prepend the new key to the existing array.
 *
 *   pnpm keys:generate
 */

async function main(): Promise<void> {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true })
  const jwk = await exportJWK(privateKey)
  const date = new Date().toISOString().slice(0, 10)
  const keys = signingJwksSchema.parse([
    {
      ...jwk,
      kid: `mbx-id-${date}-${randomBytes(4).toString("hex")}`,
      alg: "ES256",
    },
  ])
  process.stdout.write(`${JSON.stringify(keys)}\n`)
}

void main()
