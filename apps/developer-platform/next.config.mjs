/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; connect-src 'self' https://api.matchbox.markets https://*.supabase.co wss://*.supabase.co https://*.walletconnect.com wss://*.walletconnect.com https://api.web3modal.org https://*.reown.com wss://*.reown.com https://rpc-http.mezo.org https://cloudflare-eth.com; img-src 'self' data: https://cdn.discordapp.com https://*.supabase.co; frame-src https://app.matchbox.markets; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ]
  },
}

export default nextConfig
