import Reports from '@/modules/reports/pages/Reports'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/core/auth/AuthContext', () => ({
  useAuth: () => ({ profile: { org_id: 'o1' } }),
}))

vi.mock('@/core/auth/supabaseClient', () => {
  const makeExpenses = (hasCount: boolean, count: number, data: any[]) => {
    const q: any = {
      select: (...args: any[]) => {
        const opts = args[1] as any
        const isHead = opts?.head === true
        const q2: any = { eq: () => q2 }
        if (isHead) {
          q2.then = (resolve: any) => Promise.resolve({ count, data: null, error: null }).then(resolve)
        } else {
          q2.then = (resolve: any) => Promise.resolve({ data, count: data.length, error: null }).then(resolve)
        }
        return q2
      },
    }
    return q
  }

  let call = 0
  return {
    supabase: {
      from: (table: string) => {
        call += 1
        if (call === 1) return makeExpenses(true, 2, [])
        if (call === 2) return makeExpenses(true, 1, [])
        if (call === 3) return makeExpenses(true, 1, [])
        call = 0
        return makeExpenses(false, 2, [{ total_amount: 10 }, { total_amount: 5 }])
      },
    },
  }
})

describe('Reports', () => {
  it('muestra métricas de gastos', async () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Gastos totales')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('15.00 EUR')).toBeInTheDocument()
  })
})
