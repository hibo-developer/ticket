import { supabase } from '@/core/auth/supabaseClient'
import { appendAudit } from '@/core/audit/audit'
import { z } from 'zod'

const TicketStatusSchema = z.string().min(1)

export const TicketUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  vendor: z.string().trim().optional().nullable(),
  ticket_date: z.string().trim().optional().nullable(),
  amount: z.number().finite().optional().nullable(),
  currency: z.string().trim().optional().nullable(),
  status: TicketStatusSchema.optional(),
  error_code: z.string().trim().optional().nullable(),
  error_message: z.string().trim().optional().nullable(),
})

export type TicketUpdateInput = z.infer<typeof TicketUpdateSchema>

export type TicketListFilters = {
  status?: string
  error_code?: string
  created_from?: string
  created_to?: string
  ticket_id?: string
  include_deleted?: boolean
  limit?: number
}

export async function listTickets(filters: TicketListFilters = {}) {
  let q = supabase
    .from('tickets')
    .select('id, org_id, owner_user_id, title, status, ticket_date, amount, currency, vendor, error_code, error_message, recreated_from_ticket_id, deleted_at, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (!filters.include_deleted) q = q.is('deleted_at', null)
  if (filters.ticket_id) q = q.eq('id', filters.ticket_id)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.error_code) q = q.eq('error_code', filters.error_code)
  if (filters.created_from) q = q.gte('created_at', filters.created_from)
  if (filters.created_to) q = q.lte('created_at', filters.created_to)
  if (filters.limit != null) q = q.limit(Math.max(1, Math.min(500, filters.limit)))

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as any[]
}

export async function updateTicket(input: { org_id: string; ticket_id: string; patch: TicketUpdateInput }) {
  const patch = TicketUpdateSchema.parse(input.patch)

  const { error } = await supabase
    .from('tickets')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', input.ticket_id)
    .eq('org_id', input.org_id)

  if (error) throw error

  await appendAudit({
    org_id: input.org_id,
    action: 'TICKET_UPDATE',
    resource_type: 'ticket',
    resource_id: input.ticket_id,
    metadata: { patch },
  })
}

export async function softDeleteTicket(input: { org_id: string; ticket_id: string; reason?: string | null }) {
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('tickets')
    .update({ status: 'deleted', deleted_at: now, updated_at: now })
    .eq('id', input.ticket_id)
    .eq('org_id', input.org_id)

  if (error) throw error

  await appendAudit({
    org_id: input.org_id,
    action: 'TICKET_DELETE',
    resource_type: 'ticket',
    resource_id: input.ticket_id,
    metadata: { reason: input.reason ?? null },
  })
}

export async function recreateFailedTicket(input: { org_id: string; ticket_id: string }) {
  const { data, error } = await supabase.rpc('recreate_ticket_failed', { p_ticket_id: input.ticket_id })
  if (error) throw error

  const newTicketId = data as string | null
  if (!newTicketId) throw new Error('No se pudo recrear el ticket.')

  await appendAudit({
    org_id: input.org_id,
    action: 'TICKET_RECREATE_REQUEST',
    resource_type: 'ticket',
    resource_id: newTicketId,
    metadata: { from_ticket_id: input.ticket_id },
  })

  return newTicketId
}

