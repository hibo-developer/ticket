import Reports from '@/modules/reports/pages/Reports'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/core/auth/AuthContext', () => ({
  useAuth: () => ({ profile: { org_id: 'o1' } }),
}))

vi.mock('@/core/auth/supabaseClient', () => {
  const ticketsBuilder = () => {
    let draft = false
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => {
        if (k === 'status' && v === 'draft') draft = true
        return q
      },
      then: (resolve: any, reject: any) =>
        Promise.resolve({ count: draft ? 1 : 2, data: [], error: null }).then(resolve, reject),
    }
    return q
  }

  const expensesBuilder = () => {
    const q: any = {
      select: () => q,
      eq: () => q,
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: [{ total_amount: 10 }, { total_amount: 5 }], error: null }).then(resolve, reject),
    }
    return q
  }

  return {
    supabase: {
      from: (table: string) => (table === 'tickets' ? ticketsBuilder() : expensesBuilder()),
    },
  }
})

describe('Reports', () => {
  it('muestra métricas', async () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Tickets totales')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('15.00 EUR')).toBeInTheDocument()
  })
})

