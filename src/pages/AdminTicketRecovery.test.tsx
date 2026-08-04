import AdminTicketRecovery from '@/pages/AdminTicketRecovery'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Permission } from '@/core/rbac/permissions'

const mocks = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/core/auth/AuthContext', () => ({
  useAuth: () => ({ profile: { org_id: 'o1' } }),
}))

vi.mock('@/core/rbac/usePermissions', () => ({
  usePermissions: () => ({ loading: false, permissions: new Set([Permission.AdminAccess]) }),
}))

vi.mock('@/core/tickets/ticketsCrud', () => ({
  listTickets: mocks.list,
  recreateFailedTicket: vi.fn(),
  softDeleteTicket: vi.fn(),
  updateTicket: vi.fn(),
}))

describe('AdminTicketRecovery', () => {
  it('carga la lista de tickets', async () => {
    render(
      <MemoryRouter>
        <AdminTicketRecovery />
      </MemoryRouter>,
    )

    expect(screen.getByText('Recuperación de tickets')).toBeInTheDocument()
    await waitFor(() => expect(mocks.list).toHaveBeenCalled())
  })
})

