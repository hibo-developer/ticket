import ExpensesList from '@/modules/expenses/pages/ExpensesList'
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
  usePermissions: () => ({ loading: false, permissions: new Set([Permission.ExpensesRead, Permission.ExpensesWrite]) }),
}))

const insert = vi.fn().mockResolvedValue({ error: null })

const q: any = {
  select: () => q,
  eq: () => q,
  order: () => q,
  limit: () => q,
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
  insert: (...args: any[]) => {
    const r = insert(...args)
    return {
      select: () => ({
        single: () =>
          Promise.resolve({
            data: { id: 'e-new' },
            error: null,
          }),
      }),
      then: (resolve: any, reject: any) => Promise.resolve({ data: [{ id: 'e-new' }], error: null }).then(resolve, reject),
    }
  },
  then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
}

vi.mock('@/core/auth/supabaseClient', () => ({
  supabase: { from: () => q },
}))

describe('ExpensesList', () => {
  it('crea un gasto', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ExpensesList />
      </MemoryRouter>,
    )

    await user.selectOptions(screen.getByLabelText('Tipo de gasto'), 'comida')
    await user.type(screen.getByLabelText('Importe'), '12.5')
    await user.click(screen.getByRole('button', { name: 'Crear gasto' }))
    expect(insert).toHaveBeenCalled()
  })
})
