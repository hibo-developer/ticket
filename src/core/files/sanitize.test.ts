import { sanitizeFilename } from '@/core/files/sanitize'
import { describe, expect, it } from 'vitest'

describe('sanitizeFilename', () => {
  it('elimina caracteres no válidos de Windows', () => {
    expect(sanitizeFilename('a<b>c?.pdf')).toBe('a_b_c_.pdf')
  })
})

