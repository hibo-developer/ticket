import { Permission } from '@/core/rbac/permissions'
import { usePermissions } from '@/core/rbac/usePermissions'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/core/auth/AuthContext', () => ({
  useAuth: () => ({
    profile: { active: true, app_role: 'user' },
    session: { user: { id: 'u1' } },
  }),
}))

vi.mock('@/core/auth/supabaseClient', () => {
  const q: any = {
    select: () => q,
    eq: () => q,
    then: (resolve: any, reject: any) =>
      Promise.resolve({
        data: [
          {
            roles: { role_permissions: [{ permission_key: Permission.ExpensesRead }] },
          },
        ],
        error: null,
      }).then(resolve, reject),
  }
  return { supabase: { from: () => q } }
})

function Probe() {
  const { loading, permissions } = usePermissions()
  return <div>{loading ? 'loading' : permissions.has(Permission.ExpensesRead) ? 'ok' : 'no'}</div>
}

describe('usePermissions', () => {
  it('carga permisos desde roles', async () => {
    render(<Probe />)
    expect(await screen.findByText('ok')).toBeInTheDocument()
  })
})

