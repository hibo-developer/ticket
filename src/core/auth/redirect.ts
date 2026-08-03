const fallbackAppUrl = 'http://localhost:5173'

export function getAuthRedirectUrl() {
  const configuredUrl = (import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined)?.trim()
  if (configuredUrl) return configuredUrl

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return fallbackAppUrl
}
