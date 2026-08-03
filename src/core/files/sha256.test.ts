import { sha256Hex } from '@/core/files/sha256'
import { describe, expect, it } from 'vitest'

describe('sha256Hex', () => {
  it('calcula el hash esperado', async () => {
    const buf = new TextEncoder().encode('abc').buffer
    const hash = await sha256Hex(buf)
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

