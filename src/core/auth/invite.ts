import { supabase } from '@/core/auth/supabaseClient'
import { getAuthRedirectUrl } from '@/core/auth/redirect'

export async function inviteUserToOrg(input: { email: string; full_name?: string }) {
  const { data, error } = await supabase.functions.invoke('auth-invite', {
    body: { ...input, redirectTo: getAuthRedirectUrl() },
  })
  if (error) {
    const details =
      typeof error.context === 'object' && error.context && 'json' in error.context && typeof (error.context as any).json === 'function'
        ? await (error.context as any).json().catch(() => null)
        : null
    const message = details?.error ?? error.message
    throw new Error(message)
  }
  return data as { ok: true; user_id: string | null }
}
