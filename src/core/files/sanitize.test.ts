import { sanitizeFilename } from '@/core/files/sanitize'
import { describe, expect, it } from 'vitest'

describe('sanitizeFilename', () => {
  it('elimina caracteres no válidos de Windows', () => {
    expect(sanitizeFilename('a<b>c?.pdf')).toBe('a_b_c_.pdf')
  })

  it('convierte acentos y diacríticos a ASCII', () => {
    expect(sanitizeFilename('café-comunión-à-ñoño.pdf')).toBe('cafe-comunion-a-nono.pdf')
  })

  it('elimina em-dash y otros símbolos Unicode por guion', () => {
    expect(sanitizeFilename('2026-08-06 — combustible — 1234ABC.jpeg')).toBe('2026-08-06-combustible-1234ABC.jpeg')
  })

  it('devuelve fallback si queda vacío', () => {
    expect(sanitizeFilename('   ——   ')).toBe('archivo')
  })
})

