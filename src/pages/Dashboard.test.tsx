import Dashboard from '@/pages/Dashboard'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/core/auth/AuthContext', () => ({
  useAuth: () => ({ profile: { org_id: 'o1', full_name: 'Usuario' } }),
}))

const expensesEq = vi.hoisted(() => vi.fn())

vi.mock('@/core/auth/supabaseClient', () => {
  const expensesQuery: any = {
    select: () => expensesQuery,
    eq: (...args: any[]) => {
      expensesEq(...args)
      return expensesQuery
    },
    then: (resolve: any, reject: any) =>
      Promise.resolve({
        data: [
          { total_amount: 10.5, state: 'approved' },
          { total_amount: 20, state: 'pending' },
        ],
        error: null,
        count: 2,
      }).then(resolve, reject),
  }

  return {
    supabase: { from: (table: string) => expensesQuery },
  }
})

describe('Dashboard', () => {
  it('muestra métricas de gastos', async () => {
    render(<Dashboard />)

    expect(await screen.findByText('Gastos Cotepa')).toBeInTheDocument()
    expect(screen.getByText('30.50 EUR')).toBeInTheDocument()
  })
})
