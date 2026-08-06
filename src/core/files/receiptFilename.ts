import { sanitizeFilename } from '@/core/files/sanitize'

function extFromMime(mime: string | null | undefined) {
  const m = (mime ?? '').toLowerCase()
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg'
  if (m === 'image/png') return 'png'
  if (m === 'image/webp') return 'webp'
  if (m === 'application/pdf') return 'pdf'
  return null
}

function extFromName(name: string | null | undefined) {
  const n = (name ?? '').trim()
  const m = /\.([a-z0-9]{2,6})$/i.exec(n)
  const ext = m ? m[1].toLowerCase() : null
  if (ext === 'jpeg') return 'jpg'
  return ext
}

export function buildReceiptFilename(input: {
  date?: string | null
  concept?: string | null
  originalName?: string | null
  mimeType?: string | null
}) {
  const date = (input.date ?? '').trim()
  const concept = (input.concept ?? '').trim()

  const ext = extFromName(input.originalName) ?? extFromMime(input.mimeType) ?? 'jpg'
  const base = [date || new Date().toISOString().slice(0, 10), concept || 'ticket'].filter(Boolean).join('-')
  const safeBase = sanitizeFilename(base).replace(/\.[^.]+$/, '').replace(/\s+/g, '-')
  return `${safeBase}.${ext}`
}
