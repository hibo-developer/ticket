import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'

export default function Setup() {
  const { session, profile } = useAuth()
  const [orgName, setOrgName] = useState('Cotepa')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!session) return <Navigate to="/login" replace />
  if (profile) return <Navigate to="/" replace />

  const bootstrap = async () => {
    setLoading(true)
    setError(null)

    const orgRes = await supabase.from('organizations').insert({ name: orgName.trim() || 'Organización' }).select('id').single()
    if (orgRes.error) {
      setError(orgRes.error.message)
      setLoading(false)
      return
    }

    const orgId = (orgRes.data as any).id as string

    const profileRes = await supabase.from('profiles').insert({
      id: session.user.id,
      org_id: orgId,
      full_name: session.user.email ?? null,
      app_role: 'admin',
      active: true,
    })

    if (profileRes.error) {
      setError(profileRes.error.message)
      setLoading(false)
      return
    }

    setLoading(false)
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto flex min-h-screen max-w-xl items-center px-6">
        <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-zinc-500">Gastos Cotepa</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Configuración inicial</h1>
          <div className="mt-2 text-sm text-zinc-600">
            Crea la organización inicial y asigna tu usuario como administrador.
          </div>

          <div className="mt-6 space-y-3">
            <div>
              <div className="text-xs font-medium text-zinc-700">Nombre de organización</div>
              <Input className="mt-1" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </div>
            {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
            <Button className="w-full" onClick={bootstrap} disabled={loading}>
              {loading ? 'Creando…' : 'Crear y continuar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

