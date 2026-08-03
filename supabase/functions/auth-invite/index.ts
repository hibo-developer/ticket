import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0'

type Input = {
  email: string
  full_name?: string
  redirectTo?: string
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
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
    return { status: 400, error: 'Invalid redirect URL configuration' }
  }

  if (message.includes('already') || message.includes('exists') || message.includes('invited')) {
    return { status: 409, error: 'User already invited or already exists' }
  }

  if (status === 400 || message.includes('invalid email')) {
    return { status: 400, error: 'Invalid email' }
  }

  if (status === 401 || status === 403) {
    return { status: 403, error: 'Forbidden' }
  }

  return { status: 500, error: rawMessage }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(200, { ok: true })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceKey) return json(500, { error: 'Missing Supabase env' })

  const authHeader = req.headers.get('Authorization') ?? ''

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData } = await userClient.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return json(401, { error: 'Unauthorized' })

  const { data: me, error: meError } = await userClient.from('profiles').select('org_id, app_role, active').eq('id', userId).single()
  if (meError || !me?.org_id) return json(403, { error: 'Forbidden' })
  if (!me.active || me.app_role !== 'admin') return json(403, { error: 'Forbidden' })

  let input: Input
  try {
    input = (await req.json()) as Input
  } catch {
    return json(400, { error: 'Invalid request body' })
  }

  const email = normalizeEmail(input?.email ?? '')
  const redirectTo = input?.redirectTo?.trim()
  if (!email || !email.includes('@')) return json(400, { error: 'Invalid email' })

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
    return json(mapped.status, { error: mapped.error })
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

  return json(200, { ok: true, user_id: inviteRes.data.user?.id ?? null })
})
