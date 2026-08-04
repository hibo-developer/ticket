import { describe, expect, it } from 'vitest'
import { buildReceiptFilename } from '@/core/files/receiptFilename'

describe('receiptFilename', () => {
  it('usa fecha y concepto en el nombre', () => {
    const name = buildReceiptFilename({
      date: '2026-08-04',
      concept: 'BAUHAUS',
      originalName: 'IMG_1234.jpg',
      mimeType: 'image/jpeg',
    })
    expect(name).toBe('2026-08-04-BAUHAUS.jpg')
  })

  it('deriva extensión desde mime si falta', () => {
    const name = buildReceiptFilename({
      date: '2026-08-04',
      concept: 'ticket',
      originalName: 'captura',
      mimeType: 'image/png',
    })
    expect(name.endsWith('.png')).toBe(true)
  })
})

