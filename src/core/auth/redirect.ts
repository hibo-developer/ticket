const fallbackDevUrl = 'http://localhost:5173'
const fallbackProdUrl = 'https://ticket-cotepa.netlify.app'

function normalizeUrl(url: string | undefined | null) {
  const value = url?.trim()
  if (!value) return null

  try {
    const normalized = new URL(value)
    if (!['http:', 'https:'].includes(normalized.protocol)) return null
    return normalized.origin
  } catch {
    return null
  }
}

export function resolveAuthRedirectUrl(input?: {
  configuredUrl?: string | null
  runtimeOrigin?: string | null
  isProduction?: boolean
}) {
  const configuredUrl = normalizeUrl(input?.configuredUrl)
  if (configuredUrl) return configuredUrl

  const runtimeOrigin = normalizeUrl(input?.runtimeOrigin)
  if (runtimeOrigin) return runtimeOrigin

  return input?.isProduction ? fallbackProdUrl : fallbackDevUrl
}

export function getAuthRedirectUrl() {
  return resolveAuthRedirectUrl({
    configuredUrl: import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined,
    runtimeOrigin: typeof window !== 'undefined' ? window.location?.origin : undefined,
    isProduction: import.meta.env.PROD,
  })
}
