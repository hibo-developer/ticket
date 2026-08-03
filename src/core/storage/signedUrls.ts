import { supabase } from '@/core/auth/supabaseClient'

export async function signDownloadUrl(input: {
  bucket: string
  path: string
  resource_type: string
  resource_id: string
}) {
  const { data, error } = await supabase.functions.invoke('storage-sign-download', { body: input })
  if (error) throw error
  return data as { signed_url: string; expires_in: number }
}

