import { describe, expect, it } from 'vitest'
import { extractReceiptFields } from '@/core/ocr/receiptOcr'

describe('receiptOcr', () => {
  it('extrae proveedor, fecha y total desde texto de ticket', () => {
    const text = `
SUPERMERCADO EJEMPLO SL
CIF B12345678
Fecha 03/08/2026 12:10
Pan 1,20
Leche 1,05
TOTAL 2,25 EUR
`
    const fields = extractReceiptFields(text)
    expect(fields.vendor).toBe('SUPERMERCADO EJEMPLO SL')
    expect(fields.date).toBe('2026-08-03')
    expect(fields.total).toBeCloseTo(2.25, 2)
  })
})
