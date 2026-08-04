import TicketDetail from '@/modules/tickets/pages/TicketDetail'
import { Permission } from '@/core/rbac/permissions'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue(undefined),
  upload: vi.fn().mockResolvedValue({ data: null, error: null }),
  insertTicketFiles: vi.fn().mockResolvedValue({ error: null }),
  runReceiptOcr: vi.fn().mockResolvedValue({ vendor: 'RESTAURANTE RICHI', date: '2026-08-03', total: 39, text: 'mock' }),
  ticketRecord: {
    id: 't1',
    title: 'Ticket demo',
    status: 'draft',
    ticket_date: null,
    amount: 10,
    currency: 'EUR',
    vendor: 'Proveedor',
  },
}))

vi.mock('@/core/auth/AuthContext', () => ({
  useAuth: () => ({
    profile: { org_id: 'o1' },
  }),
}))

vi.mock('@/core/rbac/usePermissions', () => ({
  usePermissions: () => ({
    loading: false,
    permissions: new Set([Permission.TicketsRead, Permission.TicketsWrite, Permission.TicketsDownload]),
  }),
}))

vi.mock('@/core/audit/audit', () => ({ appendAudit: mocks.audit }))

vi.mock('@/core/files/sha256', () => ({
  sha256HexFile: vi.fn().mockResolvedValue('a'.repeat(64)),
}))

vi.mock('@/core/ocr/receiptOcr', () => ({
  runReceiptOcr: mocks.runReceiptOcr,
}))

vi.mock('@/core/storage/signedUrls', () => ({
  signDownloadUrl: vi.fn().mockResolvedValue({ signed_url: 'https://example.test/file', expires_in: 60 }),
}))

const makeThenable = (result: any) => {
  const q: any = {
    select: () => q,
    eq: () => q,
    order: () => q,
    single: () => Promise.resolve(result),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  }
  return q
}

vi.mock('@/core/auth/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'tickets') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: mocks.ticketRecord,
                    error: null,
                  }),
              }),
            }),
          }),
        }
      }
      if (table === 'ticket_files') {
        const q = makeThenable({ data: [], error: null })
        q.insert = mocks.insertTicketFiles
        return q
      }
      if (table === 'audit_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return makeThenable({ data: [], error: null })
    },
    storage: {
      from: () => ({ upload: mocks.upload }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { signed_url: 'https://example.test/file', expires_in: 60 }, error: null }),
    },
  },
}))

describe('TicketDetail', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    mocks.ticketRecord.id = 't1'
    mocks.ticketRecord.title = 'Ticket demo'
    mocks.ticketRecord.status = 'draft'
    mocks.ticketRecord.ticket_date = null
    mocks.ticketRecord.amount = 10
    mocks.ticketRecord.currency = 'EUR'
    mocks.ticketRecord.vendor = 'Proveedor'
    mocks.runReceiptOcr.mockClear()
  })

  it('sube un adjunto', async () => {
    const user = userEvent.setup()
    const file = new File([new Uint8Array([1, 2, 3])], 'ticket.pdf', { type: 'application/pdf' })

    const { container } = render(
      <MemoryRouter initialEntries={['/tickets/t1']}>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetail />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Ticket demo')).toBeInTheDocument()

    const inputs = container.querySelectorAll('input[type="file"]')
    const input = inputs[inputs.length - 1] as HTMLInputElement
    await user.upload(input, file)

    await waitFor(() => expect(mocks.upload).toHaveBeenCalled())
    await waitFor(() => expect(mocks.insertTicketFiles).toHaveBeenCalled())
    await waitFor(() => expect(mocks.audit).toHaveBeenCalled())
  })

  it('reemplaza un titulo placeholder con el comercio detectado por OCR', async () => {
    mocks.ticketRecord.title = '17858601246866857797910300800628'
    mocks.ticketRecord.vendor = null
    mocks.ticketRecord.ticket_date = null
    mocks.ticketRecord.amount = null

    const user = userEvent.setup()
    const file = new File([new Uint8Array([1, 2, 3])], 'ticket.jpg', { type: 'image/jpeg' })

    const { container } = render(
      <MemoryRouter initialEntries={['/tickets/t1']}>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetail />} />
        </Routes>
      </MemoryRouter>,
    )

    const titleInput = await screen.findByDisplayValue('17858601246866857797910300800628')
    const inputs = container.querySelectorAll('input[type="file"]')
    const input = inputs[inputs.length - 1] as HTMLInputElement
    await user.upload(input, file)

    await waitFor(() => expect(mocks.runReceiptOcr).toHaveBeenCalled())
    await waitFor(() => expect(titleInput).toHaveValue('RESTAURANTE RICHI'))
    await waitFor(() =>
      expect(screen.getAllByPlaceholderText('Establecimiento').some((el) => (el as HTMLInputElement).value === 'RESTAURANTE RICHI')).toBe(true),
    )
    await waitFor(() =>
      expect(screen.getAllByPlaceholderText('Importe total').some((el) => (el as HTMLInputElement).value === '39.00')).toBe(true),
    )

    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    await waitFor(() => expect(dateInput.value).toBe('2026-08-03'))
  })
})
