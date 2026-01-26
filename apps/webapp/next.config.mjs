import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"

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

export default nextConfig
