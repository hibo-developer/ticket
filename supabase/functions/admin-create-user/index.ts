import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0'

type Input = {
  email: string
  full_name?: string
  username?: string
  temp_password: string
  app_role?: 'admin' | 'user'
  role_ids?: string[]
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

function normalizeUsername(username: string) {
  return username.trim()
}

function validPassword(pw: string) {
  if (pw.length < 10) return false
  if (!/[a-z]/i.test(pw)) return false
  if (!/\d/.test(pw)) return false
  return true
}

function validUsername(u: string) {
  if (u.length < 3 || u.length > 32) return false
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) return false
  return true
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
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

  const { data: me, error: meError } = await userClient
    .from('profiles')
    .select('org_id, app_role, active')
    .eq('id', userId)
    .single()

  if (meError || !me?.org_id) return json(corsOrigin, 403, { error: 'No autorizado.' })
  if (!me.active || me.app_role !== 'admin') return json(corsOrigin, 403, { error: 'No autorizado.' })

  const input = (await req.json()) as Input
  const email = normalizeEmail(input?.email ?? '')
  const fullName = (input?.full_name ?? '').trim() || null
  const username = normalizeUsername(input?.username ?? '')
  const tempPassword = String(input?.temp_password ?? '')
  const appRole = input?.app_role === 'admin' ? 'admin' : 'user'
  const roleIds = Array.isArray(input?.role_ids) ? input.role_ids.filter((x) => typeof x === 'string' && x) : []

  if (!email || !email.includes('@')) return json(corsOrigin, 400, { error: 'Email inválido.' })
  if (!validPassword(tempPassword)) return json(corsOrigin, 400, { error: 'Contraseña temporal débil.' })
  if (username && !validUsername(username)) return json(corsOrigin, 400, { error: 'Nombre de usuario inválido.' })

  const availability = await userClient.rpc('admin_check_user_availability', {
    p_email: email,
    p_username: username || null,
  })

  if (availability.error) return json(corsOrigin, 500, { error: 'No se pudo validar la disponibilidad.' })

  const emailTaken = Boolean((availability.data as any)?.email_taken)
  const usernameTaken = Boolean((availability.data as any)?.username_taken)
  if (emailTaken) return json(corsOrigin, 409, { error: 'El email ya está en uso.' })
  if (username && usernameTaken) return json(corsOrigin, 409, { error: 'El nombre de usuario ya está en uso.' })

  const serviceClient = createClient(supabaseUrl, serviceKey)

  const created = await serviceClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      org_id: me.org_id,
      full_name: fullName,
      username: username || null,
      invited_by: userId,
    },
  })

  if (created.error) return json(corsOrigin, 500, { error: 'No se pudo crear el usuario.' })

  const newUserId = created.data.user?.id
  if (!newUserId) return json(corsOrigin, 500, { error: 'No se pudo crear el usuario.' })

  for (let i = 0; i < 10; i++) {
    const upd = await serviceClient.from('profiles').update({ username: username || null, app_role: appRole }).eq('id', newUserId)
    if (!upd.error) break
    await sleep(200)
  }

  if (roleIds.length) {
    const roleRes = await serviceClient.from('roles').select('id').eq('org_id', me.org_id).in('id', roleIds)
    if (roleRes.error) return json(corsOrigin, 500, { error: 'No se pudieron validar los roles.' })
    const validIds = new Set((roleRes.data ?? []).map((r: any) => r.id as string))
    if (validIds.size !== roleIds.length) return json(corsOrigin, 400, { error: 'Roles inválidos.' })

    await serviceClient.from('user_roles').delete().eq('user_id', newUserId)
    const ins = await serviceClient.from('user_roles').insert(roleIds.map((rid) => ({ user_id: newUserId, role_id: rid })))
    if (ins.error) return json(corsOrigin, 500, { error: 'No se pudieron asignar los roles.' })
  }

  await serviceClient.from('audit_log').insert({
    org_id: me.org_id,
    actor_user_id: userId,
    action: 'USER_CREATE',
    resource_type: 'auth_user',
    resource_id: newUserId,
    metadata: { email, username: username || null, app_role: appRole, role_ids: roleIds },
  })

  return json(corsOrigin, 200, { ok: true, user_id: newUserId })
})
