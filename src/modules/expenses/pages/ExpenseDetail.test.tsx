import ExpenseDetail from '@/modules/expenses/pages/ExpenseDetail'
import { Permission } from '@/core/rbac/permissions'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('@/core/auth/AuthContext', () => ({
  useAuth: () => ({
    profile: { org_id: 'o1' },
    session: { user: { id: 'u1' } },
  }),
}))

vi.mock('@/core/rbac/usePermissions', () => ({
  usePermissions: () => ({
    loading: false,
    permissions: new Set([Permission.ExpensesRead, Permission.ExpensesWrite, Permission.ExpensesApprove]),
  }),
}))

vi.mock('@/core/storage/signedUrls', () => ({
  signDownloadUrl: () => Promise.resolve({ signed_url: 'https://example.test/file', expires_in: 60 }),
}))

vi.mock('@/core/audit/audit', () => ({
  appendAudit: vi.fn().mockResolvedValue(null),
}))

const expensesQuery: any = {
  select: () => ({
    eq: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: {
              id: 'e1',
              state: 'draft',
              expense_date: '2026-01-01',
              total_amount: 10,
              currency: 'EUR',
              category: 'comida',
              vehicle_plate: null,
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          }),
      }),
    }),
  }),
}

const expenseFilesQuery: any = {
  select: () => ({
    eq: () => ({
      eq: () => ({
        order: () => ({
          then: (resolve: any) =>
            Promise.resolve({
              data: [],
              error: null,
            }).then(resolve),
        }),
      }),
    }),
  }),
}

vi.mock('@/core/auth/supabaseClient', () => ({
  supabase: {
    from: (table: string) => (table === 'expenses' ? expensesQuery : expenseFilesQuery),
    functions: {
      invoke: () => Promise.resolve({ data: { signed_url: 'https://example.test/file' }, error: null }),
    },
    storage: { from: () => ({ upload: () => Promise.resolve({ error: null }) }) },
  },
}))

describe('ExpenseDetail', () => {
  it('muestra los datos del gasto y sección de adjuntos', async () => {
    render(
      <MemoryRouter initialEntries={['/gastos/e1']}>
        <Routes>
          <Route path="/gastos/:id" element={<ExpenseDetail />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Datos del gasto')).toBeInTheDocument()
    expect(screen.getByText('Adjuntos — Ticket de caja')).toBeInTheDocument()
  })
})
