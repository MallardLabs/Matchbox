const STORAGE_KEY = "matchbox-pro:preview-banner-dismissed"

export function isPreviewBannerDismissed(): boolean {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(STORAGE_KEY) === "1"
}

export function dismissPreviewBanner() {
  window.localStorage.setItem(STORAGE_KEY, "1")
}

export const CLASSIC_URL =
  import.meta.env.VITE_CLASSIC_URL ?? "https://app.matchbox.markets"
