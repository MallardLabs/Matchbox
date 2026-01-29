export const getBaseUrl = () => {
  // 1. Prioritize explicitly set site URL from environment
  let baseUrl = process.env.NEXT_PUBLIC_SITE_URL

  // 2. Check for common deployment system environment variables
  if (!baseUrl) {
    // Netlify
    if (process.env.URL) {
      baseUrl = process.env.URL
    }
    // Vercel
    else if (process.env.NEXT_PUBLIC_VERCEL_URL) {
      baseUrl = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    }
  }

  // 3. Fallback to default (if all else fails)
  if (!baseUrl) {
    baseUrl = ""
  }

  if (baseUrl && !baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`
  }

  return baseUrl.replace(/\/$/, "")
}

export const getOgImageUrl = () => {
  return `${getBaseUrl()}/ogx.png`
}
