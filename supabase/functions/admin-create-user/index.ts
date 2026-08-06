// NOTA: no hay imports top-level. Cargamos todo con dynamic import() dentro del handler.
// Esto evita 500 CUERPO VACÍO de Supabase runtime si falla la descarga del módulo desde esm.sh
// en cold start (DNS, red, blacklist, etc.). En ese caso nuestro catch devuelve JSON detallado.

type SupabaseModule = {
  createClient: (url: string, key: string, opts?: any) => any
}

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
      vary: 'Origin',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
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
  return pw.length >= 10 && /[a-z]/i.test(pw) && /\d/.test(pw)
}
function validUsername(u: string) {
  return u.length >= 3 && u.length <= 32 && /^[a-zA-Z0-9._-]+$/.test(u)
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
  checks.anon_key = anonKey ? `set (${anonKey.length} chars, starts ${anonKey.slice(0, 8)})` : 'missing'
  checks.service_role_key = serviceKey
    ? `set (${serviceKey.length} chars, starts ${serviceKey.slice(0, 8)})`
    : 'missing'

  if (!supabaseUrl || !anonKey || !serviceKey) {
    checks.verdict = 'ERROR: faltan Secrets. Ve a Edge Functions → cada función → Secrets y define SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY.'
    return json(co, 500, checks)
  }

  try {
    const serviceClient = mod.createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const users = await serviceClient.auth.admin.listUsers()
    checks.list_users_ok = true
    checks.count_users = users.data.users?.length ?? 0
  } catch (e: any) {
    checks.list_users_ok = false
    checks.list_users_error = e?.message ?? String(e)
  }

  try {
    const serviceClient = mod.createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const col = await serviceClient
      .from('profiles')
      .select('username,app_role,org_id')
      .limit(1)
    checks.profiles_cols_ok = true
    checks.profiles_sample_rows = col.data?.length ?? 0
  } catch (e: any) {
    checks.profiles_cols_ok = false
    checks.profiles_error = e?.message ?? String(e)
    checks.hint =
      'Posible falta columna username en public.profiles. Aplica migración 20260806_000011_bootstrap_prereqs_admin_create_user.sql en SQL Editor.'
  }

  try {
    const userClient = mod.createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const rpc = await userClient.rpc('admin_check_user_availability', {
      p_email: 'test@example.com',
      p_username: 'test',
    })
    checks.rpc_admin_check_exists = !rpc.error
    if (rpc.error) checks.rpc_admin_check_error = rpc.error.message
  } catch (e: any) {
    checks.rpc_admin_check_exists = false
    checks.rpc_admin_check_error = e?.message ?? String(e)
  }

  checks.verdict =
    checks.list_users_ok && checks.profiles_cols_ok
      ? 'OK. Edge function y setup funcionan. Vuelve a /admin/usuarios y prueba Crear usuario.'
      : 'Hay errores en los checks. Solucionalos y vuelve a probar /health.'

  return json(co, 200, checks)
}

Deno.serve(async (req) => {
  const co = corsOriginFor(req)

  try {
    const mod = await loadSupabaseModule()

    if (req.method === 'OPTIONS') return json(co, 200, { ok: true })

    if (req.method === 'GET') {
      const url = new URL(req.url)
      if (url.pathname.endsWith('/health') || url.searchParams.get('health') === '1') {
        return runHealth(req, co, mod)
      }
      return json(co, 404, { error: 'GET solo soportado en /health?1' })
    }

    if (req.method !== 'POST')
      return json(co, 405, { error: 'Método no permitido (usa POST Crear o GET /health?1).' })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY')

    if (!supabaseUrl || !anonKey || !serviceKey)
      return json(co, 500, {
        error:
          'Falta Secrets en esta Edge Function. Ve a Dashboard → Edge Functions → admin-create-user → Secrets y define SUPABASE_URL, SUPABASE_ANON_KEY y SERVICE_ROLE_KEY. Luego redeploya.',
        hint:
          'Puedes diagnosticar abriendo en navegador: https://guesvujkcaftqnhojzyr.supabase.co/functions/v1/admin-create-user/health',
      })

    const authHeader = req.headers.get('Authorization') ?? ''

    const userClient = mod.createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: whoamiErr } = await userClient.auth.getUser()
    if (whoamiErr)
      return json(co, 401, { error: `Token inválido o expirado: ${whoamiErr.message}` })

    const userId = userData.user?.id
    if (!userId) return json(co, 401, { error: 'No autenticado.' })

    const { data: me, error: meError } = await userClient
      .from('profiles')
      .select('org_id, app_role, active')
      .eq('id', userId)
      .single()

    if (meError || !me?.org_id)
      return json(co, 403, {
        error:
          'No autorizado: tu perfil no existe o no perteneces a una organización. Crea una organización primero con Setup.',
      })
    if (!me.active) return json(co, 403, { error: 'Tu cuenta está desactivada.' })
    if (me.app_role !== 'admin')
      return json(co, 403, { error: 'No autorizado: necesitas app_role=admin en tu perfil.' })

    let input: Input
    try {
      input = (await req.json()) as Input
    } catch {
      return json(co, 400, { error: 'Cuerpo JSON inválido.' })
    }
    const email = normalizeEmail(input?.email ?? '')
    const fullName = (input?.full_name ?? '').trim() || null
    const username = input?.username ? normalizeUsername(input.username) : ''
    const tempPassword = String(input?.temp_password ?? '')
    const appRole = input?.app_role === 'admin' ? 'admin' : 'user'
    const roleIds = Array.isArray(input?.role_ids)
      ? input.role_ids.filter((x) => typeof x === 'string' && x.length > 0)
      : []

    if (!email || !email.includes('@')) return json(co, 400, { error: 'Email inválido.' })
    if (!validPassword(tempPassword))
      return json(co, 400, {
        error: 'Contraseña temporal débil: mínimo 10 caracteres, letras + números.',
      })
    if (username && !validUsername(username))
      return json(co, 400, {
        error: 'Nombre de usuario inválido (3-32, letras / números / . _ -).',
      })

    const serviceClient = mod.createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const listAll = await serviceClient.auth.admin.listUsers()
    const emailTaken = (listAll.data.users ?? []).some(
      (u: any) => u.email && u.email.toLowerCase() === email,
    )
    let usernameTaken = false
    if (username) {
      const uRes = await serviceClient
        .from('profiles')
        .select('id')
        .ilike('username', username)
        .limit(1)
      if (uRes.error) {
        console.warn(
          'profiles ilike username falló (posible falta columna username?):',
          uRes.error.message,
        )
      } else {
        usernameTaken = (uRes.data ?? []).length > 0
      }
    }

    try {
      await userClient.rpc('admin_check_user_availability', {
        p_email: email,
        p_username: username || null,
      })
    } catch (_ignore) {
      // ignore; listUsers + profiles ya cubren
    }

    if (emailTaken) return json(co, 409, { error: 'El email ya está en uso.' })
    if (username && usernameTaken)
      return json(co, 409, { error: 'El nombre de usuario ya está en uso.' })

    let validRoleIds: string[] = []
    if (roleIds.length > 0) {
      const roleRes = await serviceClient
        .from('roles')
        .select('id')
        .eq('org_id', me.org_id)
        .in('id', roleIds)
      if (roleRes.error)
        return json(co, 500, {
          error: `Roles lookup falló: ${roleRes.error.message}.`,
          hint: `Crea primero roles en la tabla roles de tu organización (org_id=${me.org_id}).`,
        })
      validRoleIds = Array.from(new Set((roleRes.data ?? []).map((r: any) => String(r.id))))
      if (validRoleIds.length !== roleIds.length)
        return json(co, 400, { error: 'Algún role_id no pertenece a esta organización.' })
    }

    const created = await serviceClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      phone_confirm: false,
      user_metadata: {
        org_id: me.org_id,
        full_name: fullName,
        username: username || null,
        app_role: appRole,
        invited_by: userId,
      },
    })

    if (created.error)
      return json(co, 500, {
        error: `No se pudo crear auth user: ${created.error.message}.`,
        hint: 'Causas comunes: email duplicado en auth.users; dominio bloqueado en Auth → Rate limits; necesitas añadir Redirect URL en Authentication → URL Configuration.',
      })

    const newUserId = created.data.user?.id
    if (!newUserId) return json(co, 500, { error: 'Auth admin no devolvió user_id.' })

    const upsertRes = await serviceClient
      .from('profiles')
      .upsert(
        {
          id: newUserId,
          org_id: me.org_id,
          full_name: fullName,
          username: username || null,
          app_role: appRole,
          active: true,
        },
        { onConflict: 'id', ignoreDuplicates: false },
      )
    if (upsertRes.error)
      return json(co, 500, {
        error: `profiles UPSERT falló: ${upsertRes.error.message}.`,
        hint: 'Falta columna username en public.profiles? Aplica migración 20260806_000011_bootstrap_prereqs_admin_create_user.sql en SQL Editor.',
      })

    if (validRoleIds.length > 0) {
      const delRes = await serviceClient.from('user_roles').delete().eq('user_id', newUserId)
      if (delRes.error)
        return json(co, 500, {
          error: `user_roles DELETE prev falló: ${delRes.error.message}`,
        })

      const insRes = await serviceClient
        .from('user_roles')
        .insert(validRoleIds.map((rid) => ({ user_id: newUserId, role_id: rid })))
      if (insRes.error)
        return json(co, 500, {
          error: `user_roles INSERT falló: ${insRes.error.message}`,
        })
    }

    try {
      await serviceClient.from('audit_log').insert({
        org_id: me.org_id,
        actor_user_id: userId,
        action: 'USER_CREATE',
        resource_type: 'auth_user',
        resource_id: newUserId,
        metadata: {
          email,
          username: username || null,
          app_role: appRole,
          role_ids: validRoleIds,
        },
      })
    } catch (auditErr: any) {
      console.warn('audit USER_CREATE failed:', auditErr?.message ?? auditErr)
    }

    return json(co, 200, { ok: true, user_id: newUserId })
  } catch (topErr: any) {
    const msg = topErr?.message ?? String(topErr ?? 'error desconocido')
    const stack = topErr?.stack ? String(topErr.stack).slice(0, 500) : undefined
    return json(co, 500, {
      error: 'admin-create-user EXCEPTION (top-level)',
      detail: msg,
      stack,
      hint:
        'Si "detail" es un error de red/esm.sh, prueba a redeployar. También puedes diagnosticar con GET /health?1.',
    })
  }
})
