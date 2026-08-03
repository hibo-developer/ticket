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

const insertTicket = vi.fn(() => ({
  select: () => ({
    single: () => Promise.resolve({ data: { id: 't2' }, error: null }),
  }),
}))
const insertTicketFile = vi.fn().mockResolvedValue({ error: null })
const listTicketsResult = { data: [], error: null }

const ticketsQuery: any = {
  select: () => ticketsQuery,
  eq: () => ticketsQuery,
  order: () => ticketsQuery,
  limit: () => ticketsQuery,
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
  then: (resolve: any, reject: any) => Promise.resolve(listTicketsResult).then(resolve, reject),
}

vi.mock('@/core/auth/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'tickets') {
        return {
          ...ticketsQuery,
          insert: insertTicket,
        }
      }

      if (table === 'ticket_files') {
        return {
          insert: insertTicketFile,
        }
      }

      return ticketsQuery
    },
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    },
  },
}))

vi.mock('@/core/files/sha256', () => ({
  sha256HexFile: vi.fn().mockResolvedValue('a'.repeat(64)),
}))

vi.mock('@/core/ocr/receiptOcr', () => ({
  runReceiptOcr: vi.fn().mockResolvedValue({ vendor: 'Supermercado', date: '2026-08-03', total: 12.5 }),
}))

vi.mock('@/core/audit/audit', () => ({
  appendAudit: vi.fn().mockResolvedValue(undefined),
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

    expect(insertTicket).toHaveBeenCalled()
  })

  it('muestra el botón para capturar tickets desde la lista', () => {
    render(
      <MemoryRouter>
        <TicketsList />
      </MemoryRouter>,
    )

    expect(screen.getAllByRole('button', { name: 'Capturar ticket' }).length).toBeGreaterThan(0)
  })
})
