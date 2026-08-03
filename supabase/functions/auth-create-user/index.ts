import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0'

type Input = {
  email: string
  password?: string
  full_name?: string
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
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Missing Supabase env' })

  const input = (await req.json()) as Input
  const email = normalizeEmail(input?.email ?? '')
  const password = (input?.password ?? '').trim()

  if (!email || !email.includes('@')) return json(400, { error: 'Invalid email' })
  if (!password || password.length < 8) return json(400, { error: 'Invalid password' })

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: (input.full_name ?? '').trim() || null,
      created_via: 'edge_function',
    },
  })

  if (error) {
    const message = (error.message ?? '').toLowerCase()
    if (message.includes('already') || message.includes('exists')) {
      return json(409, { error: 'User already exists' })
    }
    return json(500, { error: error.message })
  }

  return json(200, { ok: true, user_id: data.user?.id ?? null })
})
