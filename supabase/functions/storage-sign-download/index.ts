// Sin imports top-level (dynamic import dentro de handler para evitar 500 CUERPO VACÍO en cold start)

type SupabaseModule = {
  createClient: (url: string, key: string, opts?: any) => any
}

type Input = {
  resource_id: string
  resource_type: string
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origin ?? '*',
      vary: 'Origin',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    },
  })
}

function corsOriginFor(req: Request): string | null {
  const reqOrigin = req.headers.get('Origin')
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!reqOrigin || allowedOrigins.length === 0) return '*'
  return allowedOrigins.includes(reqOrigin) ? reqOrigin : null
}

async function loadSupabaseModule(): Promise<SupabaseModule> {
  const mod = await import('https://esm.sh/@supabase/supabase-js@2.57.0')
  return { createClient: mod.createClient }
}

type FileRow = {
  id: string
  org_id: string
  expense_id?: string | null
  ticket_id?: string | null
  storage_path: string
  file_name: string
  uploaded_by: string
  uploaded_at: string
}

async function lookupFile(
  client: any,
  org_id: string,
  input: Input,
): Promise<{ row: FileRow; action: string; resource_type: string } | null> {
  const rt = (input.resource_type || '').toLowerCase()
  const isExpense = rt.startsWith('expense')

  if (isExpense) {
    const r = await client
      .from('expense_files')
      .select('*')
      .eq('id', input.resource_id)
      .eq('org_id', org_id)
      .maybeSingle()
    if (r.error) throw new Error(`expense_files lookup failed: ${r.error.message}`)
    if (!r.data) return null
    return {
      row: r.data as FileRow,
      action: 'EXPENSE_RECEIPT_DOWNLOAD',
      resource_type: 'expense_file',
    }
  }

  const r = await client
    .from('ticket_files')
    .select('*')
    .eq('id', input.resource_id)
    .eq('org_id', org_id)
    .maybeSingle()
  if (r.error) throw new Error(`ticket_files lookup failed: ${r.error.message}`)
  if (!r.data) return null
  return {
    row: r.data as FileRow,
    action: 'TICKET_FILE_DOWNLOAD',
    resource_type: 'ticket_file',
  }
}

async function runHealth(req: Request, co: string | null, mod: SupabaseModule): Promise<Response> {
  const checks: Record<string, any> = {}
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY')

  checks.supabase_url = supabaseUrl ? `set (${supabaseUrl.length} chars)` : 'missing'
  checks.anon_key = anonKey ? `set (${anonKey.length} chars)` : 'missing'
  checks.service_role_key = serviceKey ? `set (${serviceKey.length} chars)` : 'missing'

  if (!supabaseUrl || !anonKey || !serviceKey) {
    checks.verdict =
      'FALTAN SECRETS. Dashboard → Edge Functions → storage-sign-download → Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY.'
    return json(co, 500, checks)
  }

  try {
    const s = mod.createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const u = await s.auth.admin.listUsers()
    checks.list_users_ok = true
    checks.count_users = u.data.users?.length ?? 0
  } catch (e: any) {
    checks.list_users_ok = false
    checks.list_users_error = e?.message ?? String(e)
  }

  checks.verdict = checks.list_users_ok
    ? 'OK. storage-sign-download function lista. Usa POST para firmar URLs o prueba desde /admin.'
    : 'Hay errores (ver list_users_error).'
  return json(co, 200, checks)
}

Deno.serve(async (req) => {
  const co = corsOriginFor(req)

  try {
    const mod = await loadSupabaseModule()

    if (req.method === 'OPTIONS') return json(co, 200, { ok: true })
    if (req.method === 'GET') {
      const url = new URL(req.url)
      if (url.pathname.endsWith('/health') || url.searchParams.get('health') === '1')
        return runHealth(req, co, mod)
      return json(co, 404, { error: 'GET solo soportado en /health?1' })
    }
    if (req.method !== 'POST')
      return json(co, 405, { error: 'Método no permitido (POST / GET /health?1).' })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY')

    if (!supabaseUrl || !anonKey || !serviceKey)
      return json(co, 500, {
        error:
          'Falta Secrets en esta Edge Function. Dashboard → Edge Functions → storage-sign-download → Secrets: define SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY.',
      })

    const authHeader = req.headers.get('Authorization') ?? ''

    const userClient = mod.createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData } = await userClient.auth.getUser()
    const userId = userData.user?.id
    if (!userId) return json(co, 401, { error: 'No autenticado.' })

    const { data: me, error: meError } = await userClient
      .from('profiles')
      .select('org_id, app_role, active')
      .eq('id', userId)
      .single()
    if (meError || !me?.org_id)
      return json(co, 403, { error: 'No autorizado (perfil u org missing).' })
    if (!me.active) return json(co, 403, { error: 'Cuenta desactivada.' })

    let input: Input
    try {
      input = (await req.json()) as Input
    } catch {
      return json(co, 400, { error: 'Cuerpo JSON inválido.' })
    }
    if (!input?.resource_id)
      return json(co, 400, { error: 'Falta resource_id en el body.' })
    if (!input?.resource_type)
      return json(co, 400, { error: 'Falta resource_type en el body (ej: expense_file).' })

    const serviceClient = mod.createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const found = await lookupFile(serviceClient, me.org_id, input)
    if (!found)
      return json(co, 404, {
        error: `No se encontró ${input.resource_type} id=${input.resource_id} en tu org.`,
      })

    const { data: signedData, error: signErr } = await serviceClient.storage
      .from('tickets-cotepa')
      .createSignedUrl(found.row.storage_path, 60)
    if (signErr || !signedData?.signedUrl)
      return json(co, 500, {
        error: `No se pudo firmar URL: ${signErr?.message ?? 'signedUrl vacía'}.`,
        hint: 'Revisa que el bucket tickets-cotepa exista y que SERVICE_ROLE_KEY tenga grants sobre storage.objects.',
      })

    try {
      await serviceClient.from('audit_log').insert({
        org_id: me.org_id,
        actor_user_id: userId,
        action: found.action,
        resource_type: found.resource_type,
        resource_id: found.row.id,
        metadata: {
          storage_path: found.row.storage_path,
          file_name: found.row.file_name,
          expense_id: found.row.expense_id ?? null,
          ticket_id: found.row.ticket_id ?? null,
        },
      })
    } catch (auditErr: any) {
      console.warn('storage-sign-download audit failed:', auditErr?.message ?? auditErr)
    }

    return json(co, 200, {
      ok: true,
      signed_url: signedData.signedUrl,
      file_name: found.row.file_name,
    })
  } catch (topErr: any) {
    const msg = topErr?.message ?? String(topErr ?? 'error desconocido')
    const stack = topErr?.stack ? String(topErr.stack).slice(0, 500) : undefined
    return json(co, 500, {
      error: 'storage-sign-download EXCEPTION (top-level)',
      detail: msg,
      stack,
    })
  }
})
