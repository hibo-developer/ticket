import TicketsList from '@/modules/tickets/pages/TicketsList'
import { Permission } from '@/core/rbac/permissions'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/core/auth/AuthContext', () => ({
  useAuth: () => ({
    profile: { org_id: 'o1' },
    session: { user: { id: 'u1' } },
  }),
}))

vi.mock('@/core/rbac/usePermissions', () => ({
  usePermissions: () => ({ loading: false, permissions: new Set([Permission.TicketsRead, Permission.TicketsWrite]) }),
}))

const insert = vi.fn().mockResolvedValue({ error: null })
const selectResult = { data: [], error: null }
const q: any = {
  select: () => q,
  eq: () => q,
  order: () => q,
  limit: () => q,
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
  insert,
  then: (resolve: any, reject: any) => Promise.resolve(selectResult).then(resolve, reject),
}

vi.mock('@/core/auth/supabaseClient', () => ({
  supabase: { from: () => q },
}))

describe('TicketsList', () => {
  it('crea un ticket', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <TicketsList />
      </MemoryRouter>,
    )

    await user.type(screen.getByPlaceholderText('Título'), 'Taxi aeropuerto')
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    expect(insert).toHaveBeenCalled()
  })
})
