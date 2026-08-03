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
    .map((l) => l.trim())
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
  const candidates = lines.slice(0, 8).filter((l) => /[a-záéíóúüñ]/i.test(l) && !/\d{4,}/.test(l))
  for (const line of candidates) {
    const lower = line.toLowerCase()
    if (blacklist.some((b) => lower.includes(b))) continue
    if (line.length < 3) continue
    return line
  }
  return candidates[0] ?? null
}

function parseAmount(value: string) {
  const cleaned = value.replace(/\s/g, '').replace('.', '').replace(',', '.')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return n
}

function extractAmounts(line: string) {
  const matches = line.match(/\d{1,5}[.,]\d{2}/g) ?? []
  const values = matches.map(parseAmount).filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  return values
}

function pickTotal(lines: string[]) {
  const totalTokens = ['total', 'importe', 'a pagar', 'pagar', 'sum', 'importe total']
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
  const { recognize } = await import('tesseract.js')
  const lang = input?.lang ?? 'spa+eng'
  const res = await recognize(image, lang, {
    logger: (m: any) => {
      if (m?.status === 'recognizing text' && typeof m?.progress === 'number') {
        input?.onProgress?.(m.progress)
      }
    },
  })
  const text = (res?.data?.text ?? '').trim()
  return { text, ...extractReceiptFields(text) }
}
