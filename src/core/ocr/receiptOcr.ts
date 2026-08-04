export type ReceiptOcrFields = {
  vendor: string | null
  date: string | null
  total: number | null
}

export type ReceiptOcrResult = ReceiptOcrFields & {
  text: string
}

function normalizeLines(text: string) {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function parseDateToIso(input: string) {
  const dmy = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(input)
  if (dmy) {
    const d = Number(dmy[1])
    const m = Number(dmy[2])
    const yRaw = Number(dmy[3])
    const y = yRaw < 100 ? 2000 + yRaw : yRaw
    if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null
    if (d < 1 || d > 31 || m < 1 || m > 12 || y < 2000 || y > 2100) return null
    return `${y}-${pad2(m)}-${pad2(d)}`
  }

  const ymd = /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/.exec(input)
  if (ymd) {
    const y = Number(ymd[1])
    const m = Number(ymd[2])
    const d = Number(ymd[3])
    if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null
    if (d < 1 || d > 31 || m < 1 || m > 12 || y < 2000 || y > 2100) return null
    return `${y}-${pad2(m)}-${pad2(d)}`
  }

  return null
}

function pickVendor(lines: string[]) {
  const blacklist = ['ticket', 'factura', 'nif', 'cif', 'iva', 'total', 'importe', 'gracias']
  const looksLikeNoise = (line: string) => {
    const compact = line.replace(/\s/g, '')
    if (!compact) return true
    const letters = compact.match(/[a-záéíóúüñ]/gi)?.length ?? 0
    const digits = compact.match(/\d/g)?.length ?? 0
    if (letters < 3) return true
    if (digits > 0) return true
    const alphaRatio = letters / compact.length
    if (alphaRatio < 0.6) return true
    const uniq = new Set(compact.toLowerCase().split(''))
    if (uniq.size <= 3 && compact.length >= 8) return true
    return false
  }

  const candidates = lines
    .slice(0, 12)
    .filter((l) => /[a-záéíóúüñ]/i.test(l))
    .filter((l) => !/\d{4,}/.test(l))
    .filter((l) => !looksLikeNoise(l))

  const scored = candidates
    .map((l) => {
      const upperRatio = (l.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '').length || 0) / (l.replace(/[^A-Za-zÁÉÍÓÚÜÑ]/g, '').length || 1)
      const penalty = blacklist.some((b) => l.toLowerCase().includes(b)) ? 1 : 0
      return { line: l, score: upperRatio - penalty }
    })
    .sort((a, b) => b.score - a.score)

  return scored[0]?.line ?? null
}

function parseAmount(value: string) {
  const cleaned = value.replace(/\s/g, '')
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(',', '.')
  const parts = normalized.split('.')
  const compact = parts.length > 2 ? `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}` : normalized
  const n = Number(compact)
  if (!Number.isFinite(n)) return null
  return n
}

function extractAmounts(line: string) {
  const matches = line.match(/\d{1,5}\s*[.,]\s*\d{2}/g) ?? []
  const values = matches.map(parseAmount).filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  if (values.length) return values

  const compactMatches = line.match(/\b\d{1,5}\s+\d{2}\b/g) ?? []
  const compactValues = compactMatches
    .map((m) => parseAmount(m.replace(/\s+/, '.')))
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  return compactValues
}

function pickTotal(lines: string[]) {
  const totalTokens = ['total', 'importe', 'a pagar', 'pagar', 'sum', 'importe total', 'total eur', 'total en eur', 'tef total', 'card', 'mastercard', 'visa']
  const totalLines = lines.filter((l) => totalTokens.some((t) => l.toLowerCase().includes(t)))
  const prioritized = totalLines.length ? totalLines : lines

  let best: number | null = null
  for (const line of prioritized) {
    const amounts = extractAmounts(line)
    for (const a of amounts) {
      if (best === null || a > best) best = a
    }
    if (totalLines.length && best !== null) return best
  }

  return best
}

function pickDate(lines: string[]) {
  for (const line of lines) {
    const d = parseDateToIso(line)
    if (d) return d
  }
  return null
}

export function extractReceiptFields(text: string): ReceiptOcrFields {
  const lines = normalizeLines(text)
  return {
    vendor: pickVendor(lines),
    date: pickDate(lines),
    total: pickTotal(lines),
  }
}

export async function runReceiptOcr(
  image: Blob,
  input?: { lang?: string; onProgress?: (progress: number) => void },
): Promise<ReceiptOcrResult> {
  const { createWorker } = await import('tesseract.js')
  const lang = input?.lang ?? 'spa+eng'

  const preprocessed = await preprocessReceiptImage(image)

  const worker = await createWorker(lang, 1, {
    logger: (m: any) => {
      if (m?.status === 'recognizing text' && typeof m?.progress === 'number') {
        input?.onProgress?.(m.progress)
      }
    },
  })

  await worker.setParameters({
    tessedit_pageseg_mode: 6 as any,
    preserve_interword_spaces: '1' as any,
  })

  const res = await worker.recognize(preprocessed)
  await worker.terminate()

  const text = (res?.data?.text ?? '').trim()
  return { text, ...extractReceiptFields(text) }
}

async function preprocessReceiptImage(image: Blob): Promise<Blob> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return image

  try {
    const bitmap = await createImageBitmap(image)
    const maxSide = Math.max(bitmap.width, bitmap.height)
    const scale = maxSide > 2000 ? 2000 / maxSide : 1
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return image

    ctx.drawImage(bitmap, 0, 0, width, height)
    const img = ctx.getImageData(0, 0, width, height)
    const data = img.data

    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    let found = false

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if (lum < 245) {
          found = true
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        }
      }
    }

    if (found) {
      const pad = Math.round(Math.min(width, height) * 0.03)
      const x0 = Math.max(0, minX - pad)
      const y0 = Math.max(0, minY - pad)
      const x1 = Math.min(width - 1, maxX + pad)
      const y1 = Math.min(height - 1, maxY + pad)
      const cropW = Math.max(1, x1 - x0 + 1)
      const cropH = Math.max(1, y1 - y0 + 1)

      const cropped = document.createElement('canvas')
      cropped.width = cropW
      cropped.height = cropH
      const cctx = cropped.getContext('2d', { willReadFrequently: true })
      if (!cctx) return image
      cctx.drawImage(canvas, x0, y0, cropW, cropH, 0, 0, cropW, cropH)

      const cropImg = cctx.getImageData(0, 0, cropW, cropH)
      const cropData = cropImg.data

      let minLum = 255
      let maxLum = 0
      for (let i = 0; i < cropData.length; i += 16) {
        const r = cropData[i]
        const g = cropData[i + 1]
        const b = cropData[i + 2]
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if (lum < 250) {
          if (lum < minLum) minLum = lum
          if (lum > maxLum) maxLum = lum
        }
      }

      const range = Math.max(1, maxLum - minLum)
      for (let i = 0; i < cropData.length; i += 4) {
        const r = cropData[i]
        const g = cropData[i + 1]
        const b = cropData[i + 2]
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        const v0 = Math.max(0, Math.min(1, (lum - minLum) / range))
        const v1 = Math.pow(v0, 0.85)
        const v = Math.round(v1 * 255)
        cropData[i] = v
        cropData[i + 1] = v
        cropData[i + 2] = v
        cropData[i + 3] = 255
      }

      cctx.putImageData(cropImg, 0, 0)

      const out = await new Promise<Blob | null>((resolve) => cropped.toBlob(resolve, 'image/png', 0.92))
      return out ?? image
    }

    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.92))
    return out ?? image
  } catch {
    return image
  }
}
