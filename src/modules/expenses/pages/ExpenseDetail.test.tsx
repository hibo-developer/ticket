import ExpenseDetail from '@/modules/expenses/pages/ExpenseDetail'
import { Permission } from '@/core/rbac/permissions'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('@/core/auth/AuthContext', () => ({
  useAuth: () => ({ profile: { org_id: 'o1' } }),
}))

vi.mock('@/core/rbac/usePermissions', () => ({
  usePermissions: () => ({ loading: false, permissions: new Set([Permission.ExpensesRead, Permission.ExpensesWrite]) }),
}))

const insertLink = vi.fn().mockResolvedValue({ error: null })
const deleteLink = vi.fn().mockResolvedValue({ error: null })

const makeThenable = (result: any) => {
  const q: any = {
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: () => q,
    single: () => Promise.resolve(result),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  }
  return q
}

vi.mock('@/core/auth/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'expenses') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: 'e1', state: 'draft', expense_date: '2026-01-01', total_amount: 10, currency: 'EUR', category: 'Transporte' },
                    error: null,
                  }),
              }),
            }),
          }),
        }
      }
      if (table === 'expense_tickets') {
        const q = makeThenable({ data: [], error: null })
        q.insert = insertLink
        q.delete = () => ({ eq: () => ({ eq: () => ({ eq: () => deleteLink }) }) })
        return q
      }
      if (table === 'tickets') {
        const q = makeThenable({ data: [{ id: 't1', title: 'Ticket demo' }], error: null })
        return q
      }
      return makeThenable({ data: [], error: null })
    },
  },
}))

describe('ExpenseDetail', () => {
  it('vincula un ticket', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/gastos/e1']}>
        <Routes>
          <Route path="/gastos/:id" element={<ExpenseDetail />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Tickets vinculados')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox'), 't1')
    await user.click(screen.getByRole('button', { name: 'Vincular' }))

    expect(insertLink).toHaveBeenCalled()
  })
})

