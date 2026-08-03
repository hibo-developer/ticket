export function sanitizeFilename(name: string) {
  return name
    .trim()
    .replace(/[\\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
}
