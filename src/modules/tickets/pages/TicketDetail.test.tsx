import TicketDetail from '@/modules/tickets/pages/TicketDetail'
import { Permission } from '@/core/rbac/permissions'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue(undefined),
  upload: vi.fn().mockResolvedValue({ data: null, error: null }),
  insertTicketFiles: vi.fn().mockResolvedValue({ error: null }),
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
                    data: { id: 't1', title: 'Ticket demo', status: 'draft', ticket_date: null, amount: 10, currency: 'EUR', vendor: 'Proveedor' },
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

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)

    await waitFor(() => expect(mocks.upload).toHaveBeenCalled())
    await waitFor(() => expect(mocks.insertTicketFiles).toHaveBeenCalled())
    await waitFor(() => expect(mocks.audit).toHaveBeenCalled())
  })
})
