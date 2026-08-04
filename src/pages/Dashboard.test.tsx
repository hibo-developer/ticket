import Dashboard from '@/pages/Dashboard'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/core/auth/AuthContext', () => ({
  useAuth: () => ({ profile: { org_id: 'o1', full_name: 'Usuario' } }),
}))

const ticketsIs = vi.hoisted(() => vi.fn())
const ticketsNeq = vi.hoisted(() => vi.fn())

vi.mock('@/core/auth/supabaseClient', () => {
  const ticketsQuery: any = {
    select: () => ticketsQuery,
    eq: () => ticketsQuery,
    is: (...args: any[]) => {
      ticketsIs(...args)
      return ticketsQuery
    },
    neq: (...args: any[]) => {
      ticketsNeq(...args)
      return ticketsQuery
    },
    then: (resolve: any, reject: any) =>
      Promise.resolve({ count: 4, data: [], error: null }).then(resolve, reject),
  }

  const expensesQuery: any = {
    select: () => expensesQuery,
    eq: () => expensesQuery,
    then: (resolve: any, reject: any) =>
      Promise.resolve({ count: 2, data: [], error: null }).then(resolve, reject),
  }

  return {
    supabase: {
      from: (table: string) => (table === 'tickets' ? ticketsQuery : expensesQuery),
    },
  }
})

describe('Dashboard', () => {
  it('contabiliza solo tickets validos', async () => {
    render(<Dashboard />)

    expect(await screen.findByText('Tickets válidos')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(ticketsIs).toHaveBeenCalledWith('deleted_at', null)
    expect(ticketsNeq).toHaveBeenCalledWith('status', 'draft')
  })
})
