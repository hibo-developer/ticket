import TicketsList from '@/modules/tickets/pages/TicketsList'
import { Permission } from '@/core/rbac/permissions'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
const updateTicket: any = vi.fn()
const updateTicketQuery: any = {
  eq: () => updateTicketQuery,
  then: (resolve: any, reject: any) => Promise.resolve({ error: null }).then(resolve, reject),
}
updateTicket.mockImplementation(() => updateTicketQuery)

const insertTicketFile = vi.fn().mockResolvedValue({ error: null })
const uploadObject = vi.fn().mockResolvedValue({ data: null, error: null })
const listTicketsResult = { data: [], error: null }

const ticketsQuery: any = {
  select: () => ticketsQuery,
  eq: () => ticketsQuery,
  is: () => ticketsQuery,
  lt: () => ticketsQuery,
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
          update: updateTicket,
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
        upload: uploadObject,
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
  beforeEach(() => {
    insertTicket.mockClear()
    updateTicket.mockClear()
    insertTicketFile.mockClear()
    uploadObject.mockClear()
    listTicketsResult.data = []
  })

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

  it('al pulsar el botón de capturar dispara el selector de archivos', async () => {
    const user = userEvent.setup()
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click')

    render(
      <MemoryRouter>
        <TicketsList />
      </MemoryRouter>,
    )

    await user.click(screen.getAllByRole('button', { name: 'Capturar ticket' })[0])
    expect(clickSpy).toHaveBeenCalled()
    clickSpy.mockRestore()
  })

  it('captura un ticket desde una imagen y sube el adjunto', async () => {
    const user = userEvent.setup()

    const { container } = render(
      <MemoryRouter>
        <TicketsList />
      </MemoryRouter>,
    )

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['img'], 'ticket.jpg', { type: 'image/jpeg' })
    await user.upload(input, file)

    await waitFor(() => expect(insertTicket).toHaveBeenCalled())
    await waitFor(() => expect(uploadObject).toHaveBeenCalled())
    await waitFor(() => expect(insertTicketFile).toHaveBeenCalled())
  })

  it('muestra el botón para capturar tickets desde la lista', () => {
    render(
      <MemoryRouter>
        <TicketsList />
      </MemoryRouter>,
    )

    expect(screen.getAllByRole('button', { name: 'Capturar ticket' }).length).toBeGreaterThan(0)
  })

  it('elimina un ticket desde la lista', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    listTicketsResult.data = [
      {
        id: 't1',
        title: 'Ticket demo',
        status: 'draft',
        ticket_date: null,
        amount: null,
        currency: 'EUR',
        vendor: null,
        created_at: '2026-08-04T10:00:00.000Z',
        deleted_at: null,
      },
    ]

    render(
      <MemoryRouter>
        <TicketsList />
      </MemoryRouter>,
    )

    await screen.findByText('Ticket demo')
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(updateTicket).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Ticket demo')).not.toBeInTheDocument())

    confirmSpy.mockRestore()
  })

  it('muestra el estado en español', async () => {
    listTicketsResult.data = [
      {
        id: 't1',
        title: 'Ticket demo',
        status: 'draft',
        ticket_date: null,
        amount: null,
        currency: 'EUR',
        vendor: null,
        created_at: '2026-08-04T10:00:00.000Z',
        deleted_at: null,
      },
    ]

    render(
      <MemoryRouter>
        <TicketsList />
      </MemoryRouter>,
    )

    await screen.findByText('Ticket demo')
    expect(screen.getByText('Borrador')).toBeInTheDocument()
  })
})
