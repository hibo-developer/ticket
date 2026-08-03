
import { useEnabledModules } from '@/core/modules/useEnabledModules'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/core/auth/AuthContext', () => ({
  useAuth: () => ({ profile: { org_id: 'o1' } }),
}))

vi.mock('@/core/auth/supabaseClient', () => {
  const q: any = {
    select: () => q,
    eq: () => q,
    in: () => q,
    then: (resolve: any, reject: any) =>
      Promise.resolve({ data: [{ module_id: 'tickets', enabled: false }], error: null }).then(resolve, reject),
  }
  return { supabase: { from: () => q } }
})

function Probe() {
  const { loading, enabled } = useEnabledModules(['tickets', 'expenses'])
  if (loading) return <div>loading</div>
  return <div>{enabled.has('tickets') ? 'tickets-on' : 'tickets-off'}</div>
}

describe('useEnabledModules', () => {
  it('respeta toggles por org', async () => {
    render(<Probe />)
    expect(await screen.findByText('tickets-off')).toBeInTheDocument()
  })
})

