function stripDiacritics(s: string): string {
  if (typeof s !== 'string') return ''
  if (!('normalize' in String.prototype)) return s
  try {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  } catch {
    return s
  }
}

export function sanitizeFilename(name: string) {
  const clean = stripDiacritics(name ?? '')
    .trim()
    .replace(/[\\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
  const ascii = clean
    .replace(/[^A-Za-z0-9 ._@()-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/[-\s]+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .replace(/\s+/g, '-')
  return ascii || 'archivo'
}
