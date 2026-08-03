import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0'

type Input = {
  bucket: string
  path: string
  resource_type: string
  resource_id: string
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(200, { ok: true })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceKey) return json(500, { error: 'Missing Supabase env' })

  const authHeader = req.headers.get('Authorization') ?? ''

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData } = await userClient.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return json(401, { error: 'Unauthorized' })

  const input = (await req.json()) as Input
  if (!input?.bucket || !input?.path || !input?.resource_id) return json(400, { error: 'Invalid payload' })

  const { data: fileRow, error: fileError } = await userClient
    .from('ticket_files')
    .select('id, org_id, filename, storage_bucket, storage_path, sha256')
    .eq('id', input.resource_id)
    .single()

  if (fileError || !fileRow) return json(404, { error: 'Not found' })
  if (fileRow.storage_bucket !== input.bucket || fileRow.storage_path !== input.path) return json(400, { error: 'Path mismatch' })

  const serviceClient = createClient(supabaseUrl, serviceKey)
  const { data: signed, error: signError } = await serviceClient.storage.from(input.bucket).createSignedUrl(input.path, 60)
  if (signError || !signed?.signedUrl) return json(500, { error: 'Sign failed' })

  await serviceClient.from('audit_log').insert({
    org_id: fileRow.org_id,
    actor_user_id: userId,
    action: 'TICKET_FILE_DOWNLOAD',
    resource_type: 'ticket_file',
    resource_id: fileRow.id,
    metadata: { filename: fileRow.filename, sha256: fileRow.sha256 },
  })

  return json(200, { signed_url: signed.signedUrl, expires_in: 60 })
})

