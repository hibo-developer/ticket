import { supabase } from '@/core/auth/supabaseClient'
import { describe, expect, it } from 'vitest'

describe('supabaseClient', () => {
  it('crea el cliente en modo test sin variables de entorno', () => {
    expect(supabase).toBeTruthy()
  })
})

