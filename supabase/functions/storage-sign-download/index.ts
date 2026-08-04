import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0'

type Input = {
  bucket: string
  path: string
  resource_type: string
  resource_id: string
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origin ?? '*',
      'vary': 'Origin',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  })
}

Deno.serve(async (req) => {
  const reqOrigin = req.headers.get('Origin')
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const corsOrigin = reqOrigin && allowedOrigins.length ? (allowedOrigins.includes(reqOrigin) ? reqOrigin : null) : '*'

  try {
    if (req.method === 'OPTIONS') return json(corsOrigin, 200, { ok: true })
    if (req.method !== 'POST') return json(corsOrigin, 405, { error: 'Método no permitido.' })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY')

    if (!supabaseUrl || !anonKey || !serviceKey) return json(corsOrigin, 500, { error: 'Falta configuración de Supabase.' })

    const authHeader = req.headers.get('Authorization') ?? ''

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData } = await userClient.auth.getUser()
    const userId = userData.user?.id
    if (!userId) return json(corsOrigin, 401, { error: 'No autenticado.' })

    let input: Input
    try {
      input = (await req.json()) as Input
    } catch {
      return json(corsOrigin, 400, { error: 'Solicitud inválida.' })
    }

    if (!input?.bucket || !input?.path || !input?.resource_id) return json(corsOrigin, 400, { error: 'Solicitud inválida.' })

    const { data: fileRow, error: fileError } = await userClient
      .from('ticket_files')
      .select('id, org_id, filename, storage_bucket, storage_path, sha256')
      .eq('id', input.resource_id)
      .single()

    if (fileError || !fileRow) return json(corsOrigin, 404, { error: 'Recurso no encontrado.' })
    if (fileRow.storage_bucket !== input.bucket || fileRow.storage_path !== input.path) return json(corsOrigin, 400, { error: 'Ruta inválida.' })

    const serviceClient = createClient(supabaseUrl, serviceKey)
    const { data: signed, error: signError } = await serviceClient.storage.from(input.bucket).createSignedUrl(input.path, 60)
    if (signError || !signed?.signedUrl) {
      console.error('storage-sign-download createSignedUrl failed', signError)
      return json(corsOrigin, 500, { error: 'No se pudo firmar la descarga.' })
    }

    const auditRes = await serviceClient.from('audit_log').insert({
      org_id: fileRow.org_id,
      actor_user_id: userId,
      action: 'TICKET_FILE_DOWNLOAD',
      resource_type: 'ticket_file',
      resource_id: fileRow.id,
      metadata: { filename: fileRow.filename, sha256: fileRow.sha256 },
    })

    if (auditRes.error) {
      console.error('storage-sign-download audit_log insert failed', auditRes.error)
    }

    return json(corsOrigin, 200, { signed_url: signed.signedUrl, expires_in: 60 })
  } catch (error) {
    console.error('storage-sign-download unexpected error', error)
    return json(corsOrigin, 500, { error: 'Error interno al generar la descarga.' })
  }
})
