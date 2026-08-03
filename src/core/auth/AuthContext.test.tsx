import { AuthProvider, useAuth } from '@/core/auth/AuthContext'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/core/auth/supabaseClient', () => {
  const session = { user: { id: 'u1' } }
  const profilesQuery: any = {
    select: () => profilesQuery,
    eq: () => profilesQuery,
    single: () =>
      Promise.resolve({
        data: { id: 'u1', org_id: 'o1', full_name: 'Usuario', app_role: 'admin', active: true },
        error: null,
      }),
  }

  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session } }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
        signOut: vi.fn().mockResolvedValue({}),
      },
      from: () => profilesQuery,
    },
  }
})

function Probe() {
  const { loading, profile, session } = useAuth()
  if (loading) return <div>loading</div>
  return <div>{session && profile ? 'ready' : 'no'}</div>
}

describe('AuthProvider', () => {
  it('carga sesión y perfil', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(await screen.findByText('ready')).toBeInTheDocument()
  })
})

