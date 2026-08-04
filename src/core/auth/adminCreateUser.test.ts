import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue({ data: { ok: true, user_id: 'u2' }, error: null }),
}))

vi.mock('@/core/auth/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: mocks.invoke,
    },
  },
}))

import { adminCreateUser } from '@/core/auth/adminCreateUser'

describe('adminCreateUser', () => {
  it('invoca la Edge Function', async () => {
    const res = await adminCreateUser({ email: 'a@b.com', temp_password: 'Abcdef12345' })
    expect(res.user_id).toBe('u2')
    expect(mocks.invoke).toHaveBeenCalledWith('admin-create-user', { body: { email: 'a@b.com', temp_password: 'Abcdef12345' } })
  })
})
