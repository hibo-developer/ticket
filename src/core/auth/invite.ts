import { supabase } from '@/core/auth/supabaseClient'

export async function inviteUserToOrg(input: { email: string; full_name?: string }) {
  const { data, error } = await supabase.functions.invoke('auth-invite', { body: input })
  if (error) throw error
  return data as { ok: true; user_id: string | null }
}
