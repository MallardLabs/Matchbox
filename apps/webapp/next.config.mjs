import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"
import { PHASE_PRODUCTION_BUILD } from "next/constants.js"

initOpenNextCloudflareForDev()

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@repo/shared",
    "@mezo-org/passport",
    "@mezo-org/orangekit",
    "@mezo-org/orangekit-contracts",
    "@mezo-org/orangekit-smart-account",
  ],
  experimental: {
    // Mark packages with workerd-specific exports as external for Cloudflare Workers
    serverComponentsExternalPackages: [
      "viem",
      "isows",
      "uncrypto",
      "@coinbase/cdp-sdk",
    ],
  },
}

export default function configureNext(phase) {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const required = [
      "NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]
    const missing = required.filter((name) => !process.env[name]?.trim())
    if (missing.length > 0) {
      throw new Error(
        `Missing required build variables: ${missing.join(", ")}. Set these in the build environment before building. Next.js embeds NEXT_PUBLIC_* values in browser assets; Worker runtime variables cannot repair an already-built app.`,
      )
    }
  }
  return nextConfig
}
