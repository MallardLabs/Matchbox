/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@repo/matchbox-mcp"],
  experimental: {
    serverComponentsExternalPackages: ["pino", "pino-pretty"],
  },
  webpack(config, { isServer }) {
    if (isServer) config.externals.push("pino", "pino-pretty", "thread-stream")
    return config
  },
}

export default nextConfig
