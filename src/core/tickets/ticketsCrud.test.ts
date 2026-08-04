import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue({ error: null }),
  rpc: vi.fn().mockResolvedValue({ data: 't_new', error: null }),
  audit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/core/audit/audit', () => ({
  appendAudit: mocks.audit,
}))

const listThenable: any = {
  select: () => listThenable,
  order: () => listThenable,
  is: () => listThenable,
  eq: () => listThenable,
  gte: () => listThenable,
  lte: () => listThenable,
  limit: () => listThenable,
  then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
}

vi.mock('@/core/auth/supabaseClient', () => ({
  supabase: {
    from: () => ({
      ...listThenable,
      update: () => ({ eq: () => ({ eq: mocks.update }) }),
    }),
    rpc: mocks.rpc,
  },
}))

import { recreateFailedTicket, softDeleteTicket, updateTicket } from '@/core/tickets/ticketsCrud'
import { appendAudit } from '@/core/audit/audit'

describe('ticketsCrud', () => {
  it('recrea un ticket fallido vía rpc y registra auditoría', async () => {
    const id = await recreateFailedTicket({ org_id: 'o1', ticket_id: 't1' })
    expect(id).toBe('t_new')
    expect(mocks.rpc).toHaveBeenCalledWith('recreate_ticket_failed', { p_ticket_id: 't1' })
    expect(appendAudit).toHaveBeenCalled()
  })

  it('actualiza ticket y registra auditoría', async () => {
    await updateTicket({ org_id: 'o1', ticket_id: 't1', patch: { title: 'Nuevo' } })
    expect(mocks.update).toHaveBeenCalled()
    expect(appendAudit).toHaveBeenCalled()
  })

  it('soft delete y registra auditoría', async () => {
    await softDeleteTicket({ org_id: 'o1', ticket_id: 't1', reason: 'no recuperable' })
    expect(mocks.update).toHaveBeenCalled()
    expect(appendAudit).toHaveBeenCalled()
  })
})

