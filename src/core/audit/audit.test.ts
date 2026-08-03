import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn(() => ({ insert }))
  return { insert, from }
})

vi.mock('@/core/auth/supabaseClient', () => ({
  supabase: { from: mocks.from },
}))

import { appendAudit } from '@/core/audit/audit'

describe('appendAudit', () => {
  it('inserta un evento de auditoría', async () => {
    await appendAudit({
      org_id: 'o1',
      action: 'TEST',
      resource_type: 'x',
      resource_id: null,
      metadata: { a: 1 },
    })
    expect(mocks.from).toHaveBeenCalledWith('audit_log')
    expect(mocks.insert).toHaveBeenCalled()
  })
})
