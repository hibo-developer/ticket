import AdminUsers from '@/pages/AdminUsers'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/core/auth/AuthContext', () => ({
  useAuth: () => ({ profile: { org_id: 'o1', id: 'u1' } }),
}))

vi.mock('@/core/rbac/usePermissions', () => ({
  usePermissions: () => ({ loading: false, permissions: new Set(['admin.access']) }),
}))

vi.mock('@/core/auth/invite', () => ({
  inviteUserToOrg: vi.fn(),
}))

vi.mock('@/core/auth/adminCreateUser', () => ({
  adminCreateUser: vi.fn(),
}))

vi.mock('@/core/auth/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: { email_taken: false, username_taken: false }, error: null }),
  },
}))

describe('AdminUsers', () => {
  it('muestra creación de usuarios para admin', async () => {
    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>,
    )
    const els = await screen.findAllByText('Crear usuario')
    expect(els.length).toBeGreaterThan(0)
  })
})
