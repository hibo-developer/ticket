import { supabase } from '@/core/auth/supabaseClient'

export async function appendAudit(event: {
  org_id: string
  action: string
  resource_type: string
  resource_id: string | null
  metadata?: Record<string, unknown>
}) {
  const { error } = await supabase.from('audit_log').insert({
    org_id: event.org_id,
    action: event.action,
    resource_type: event.resource_type,
    resource_id: event.resource_id,
    metadata: event.metadata ?? {},
  })

  if (error) throw error
}

