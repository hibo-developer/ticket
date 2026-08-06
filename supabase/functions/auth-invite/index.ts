// Importaciones dinámicas dentro del handler (evita 500 vacío en cold start fallo de descarga esm.sh)

type SupabaseModule = {
  createClient: (url: string, key: string, opts?: any) => any
}

type Input = {
  email: string
  full_name?: string
  redirectTo?: string
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function mapInviteError(error: { message?: string; status?: number | string } | null | undefined) {
  const rawMessage = error?.message ?? 'Invite failed'
  const message = rawMessage.toLowerCase()
  const status = typeof error?.status === 'string' ? Number(error.status) : error?.status

  if (message.includes('redirect') || message.includes('not allowed') || message.includes('site url')) {
    return {
      status: 400,
      error:
        'Configuración inválida de URL de redirección. Ve a Authentication → URL Configuration y añade tu dominio a Redirect URLs (wildcard vale: https://tudominio.com/**).',
    }
  }

  if (message.includes('already') || message.includes('exists') || message.includes('invited')) {
    return { status: 409, error: 'El usuario ya existe o ya fue invitado.' }
  }

  if (status === 400 || message.includes('invalid email')) {
    return { status: 400, error: 'Email inválido.' }
  }

  if (status === 401 || status === 403) {
    return { status: 403, error: 'No autorizado (service role?).' }
  }

  return { status: 500, error: `No se pudo enviar la invitación: ${rawMessage}.` }
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
      'FALTAN SECRETS. Dashboard → Edge Functions → auth-invite → Secrets: añade SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY.'
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
    ? 'OK. auth-invite function está lista. Usa POST para invitar o prueba desde /admin/usuarios.'
    : 'Hay errores (arriba list_users_error).'
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
          'Falta Secrets en esta Edge Function. Dashboard → Edge Functions → auth-invite → Secrets: define SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY.',
      })

    const authHeader = req.headers.get('Authorization') ?? ''

    const userClient = mod.createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: whoamiErr } = await userClient.auth.getUser()
    if (whoamiErr) return json(co, 401, { error: `Token inválido: ${whoamiErr.message}` })

    const userId = userData.user?.id
    if (!userId) return json(co, 401, { error: 'No autenticado.' })

    const { data: me, error: meError } = await userClient
      .from('profiles')
      .select('org_id, app_role, active')
      .eq('id', userId)
      .single()

    if (meError || !me?.org_id)
      return json(co, 403, {
        error: 'No autorizado: tu perfil no existe o no tienes organización.',
      })
    if (!me.active) return json(co, 403, { error: 'Cuenta desactivada.' })
    if (me.app_role !== 'admin')
      return json(co, 403, { error: 'No autorizado: necesitas app_role=admin.' })

    let input: Input
    try {
      input = (await req.json()) as Input
    } catch {
      return json(co, 400, { error: 'Solicitud JSON inválida.' })
    }

    const email = normalizeEmail(input?.email ?? '')
    const fullName = (input.full_name ?? '').trim() || null
    const redirectTo = input?.redirectTo?.trim()
    if (!email || !email.includes('@')) return json(co, 400, { error: 'Email inválido.' })

    const serviceClient = mod.createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: listAll } = await serviceClient.auth.admin.listUsers()
    const dup = (listAll?.users ?? []).find(
      (u: any) => u.email && u.email.toLowerCase() === email,
    )
    if (dup) return json(co, 409, { error: 'El email ya existe en auth.users.' })

    const inviteRes = await serviceClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo || undefined,
      data: {
        org_id: me.org_id,
        full_name: fullName,
        invited_by: userId,
      },
    })

    if (inviteRes.error) {
      const mapped = mapInviteError(inviteRes.error)
      return json(co, mapped.status, { error: mapped.error })
    }

    const resourceId = inviteRes.data.user?.id ?? null
    try {
      await serviceClient.from('audit_log').insert({
        org_id: me.org_id,
        actor_user_id: userId,
        action: 'USER_INVITE',
        resource_type: 'auth_user',
        resource_id: resourceId,
        metadata: { email, full_name: fullName },
      })
    } catch (auditErr: any) {
      console.warn('auth-invite audit failed:', auditErr?.message ?? auditErr)
    }

    return json(co, 200, { ok: true, user_id: resourceId })
  } catch (topErr: any) {
    const msg = topErr?.message ?? String(topErr ?? 'error desconocido')
    const stack = topErr?.stack ? String(topErr.stack).slice(0, 500) : undefined
    return json(co, 500, {
      error: 'auth-invite EXCEPTION (top-level)',
      detail: msg,
      stack,
    })
  }
})
