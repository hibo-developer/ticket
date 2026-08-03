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

  const input = (await req.json()) as Input
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

  if (inviteRes.error) return json(500, { error: inviteRes.error.message })

  await serviceClient.from('audit_log').insert({
    org_id: me.org_id,
    actor_user_id: userId,
    action: 'USER_INVITE',
    resource_type: 'auth_user',
    resource_id: inviteRes.data.user?.id ?? null,
    metadata: { email },
  })

  return json(200, { ok: true, user_id: inviteRes.data.user?.id ?? null })
})
