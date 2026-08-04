import { supabase } from '@/core/auth/supabaseClient'

export async function signDownloadUrl(input: {
  bucket: string
  path: string
  resource_type: string
  resource_id: string
}) {
  const { data, error } = await supabase.functions.invoke('storage-sign-download', { body: input })
  if (error) {
    const details =
      typeof error.context === 'object' && error.context && 'json' in error.context && typeof (error.context as any).json === 'function'
        ? await (error.context as any).json().catch(() => null)
        : null
    const message = details?.error ?? error.message
    throw new Error(message)
  }
  return data as { signed_url: string; expires_in: number }
}

