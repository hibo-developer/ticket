import { supabase } from '@/core/auth/supabaseClient'
import { getAuthRedirectUrl } from '@/core/auth/redirect'

export async function inviteUserToOrg(input: { email: string; full_name?: string }) {
  const { data, error } = await supabase.functions.invoke('auth-invite', {
    body: { ...input, redirectTo: getAuthRedirectUrl() },
  })
  if (error) throw error
  return data as { ok: true; user_id: string | null }
}
