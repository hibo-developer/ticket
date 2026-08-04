import { supabase } from '@/core/auth/supabaseClient'

export type AdminCreateUserInput = {
  email: string
  full_name?: string
  username?: string
  temp_password: string
  app_role?: 'admin' | 'user'
  role_ids?: string[]
}

export async function adminCreateUser(input: AdminCreateUserInput) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', { body: input })
  if (error) throw error
  return data as { ok: true; user_id: string }
}

