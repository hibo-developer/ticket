import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0'

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
      'vary': 'Origin',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
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
    return { status: 400, error: 'Configuración inválida de URL de redirección.' }
  }

  if (message.includes('already') || message.includes('exists') || message.includes('invited')) {
    return { status: 409, error: 'El usuario ya existe o ya fue invitado.' }
  }

  if (status === 400 || message.includes('invalid email')) {
    return { status: 400, error: 'Email inválido.' }
  }

  if (status === 401 || status === 403) {
    return { status: 403, error: 'No autorizado.' }
  }

  return { status: 500, error: 'No se pudo enviar la invitación.' }
}

Deno.serve(async (req) => {
  const reqOrigin = req.headers.get('Origin')
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const corsOrigin = reqOrigin && allowedOrigins.length ? (allowedOrigins.includes(reqOrigin) ? reqOrigin : null) : '*'

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

  const { data: me, error: meError } = await userClient.from('profiles').select('org_id, app_role, active').eq('id', userId).single()
  if (meError || !me?.org_id) return json(corsOrigin, 403, { error: 'No autorizado.' })
  if (!me.active || me.app_role !== 'admin') return json(corsOrigin, 403, { error: 'No autorizado.' })

  let input: Input
  try {
    input = (await req.json()) as Input
  } catch {
    return json(corsOrigin, 400, { error: 'Solicitud inválida.' })
  }

  const email = normalizeEmail(input?.email ?? '')
  const redirectTo = input?.redirectTo?.trim()
  if (!email || !email.includes('@')) return json(corsOrigin, 400, { error: 'Email inválido.' })

  const serviceClient = createClient(supabaseUrl, serviceKey)

  const inviteRes = await serviceClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: redirectTo || undefined,
    data: {
      org_id: me.org_id,
      full_name: (input.full_name ?? '').trim() || null,
      invited_by: userId,
    },
  })

  if (inviteRes.error) {
    const mapped = mapInviteError(inviteRes.error)
    return json(corsOrigin, mapped.status, { error: mapped.error })
  }

  const auditRes = await serviceClient.from('audit_log').insert({
    org_id: me.org_id,
    actor_user_id: userId,
    action: 'USER_INVITE',
    resource_type: 'auth_user',
    resource_id: inviteRes.data.user?.id ?? null,
    metadata: { email },
  })

  if (auditRes.error) {
    console.error('auth-invite audit_log insert failed', auditRes.error)
  }

  return json(corsOrigin, 200, { ok: true, user_id: inviteRes.data.user?.id ?? null })
})
