import { Button } from '@/components/ui/Button'
import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { defaultViews, type DefaultViewKey } from '@/core/views/defaults'
import { viewLayoutSchema } from '@/core/views/schema'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type Entity = 'tickets' | 'expenses'
type ViewType = 'list' | 'form'

function toViewKey(entity: Entity, viewType: ViewType) {
  return `${entity}.${viewType}` as DefaultViewKey
}

export default function AdminViews() {
  const { profile } = useAuth()
  const [entity, setEntity] = useState<Entity>('tickets')
  const [viewType, setViewType] = useState<ViewType>('list')
  const viewKey = useMemo(() => toViewKey(entity, viewType), [entity, viewType])

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!profile?.org_id) return
      setLoading(true)
      setError(null)
      setHint(null)

      const { data } = await supabase
        .from('ui_views')
        .select('layout')
        .eq('org_id', profile.org_id)
        .eq('view_key', viewKey)
        .eq('active', true)
        .maybeSingle()

      if (cancelled) return

      const layout = data?.layout ?? defaultViews[viewKey]
      setJsonText(JSON.stringify(layout, null, 2))
      setLoading(false)
    }

    run()

    return () => {
      cancelled = true
    }
  }, [profile?.org_id, viewKey])

  const save = async () => {
    if (!profile?.org_id) return
    setBusy(true)
    setError(null)
    setHint(null)

    try {
      const parsedJson = JSON.parse(jsonText)
      const parsed = viewLayoutSchema.safeParse(parsedJson)
      if (!parsed.success) {
        setError('El JSON no cumple el esquema (fields: [{ key, label, visible?, required? }]).')
        setBusy(false)
        return
      }

      const { error } = await supabase.from('ui_views').upsert({
        org_id: profile.org_id,
        view_key: viewKey,
        entity_key: entity,
        view_type: viewType,
        schema: {},
        layout: parsed.data,
        rules: {},
        applies_to_role: null,
        active: true,
        updated_at: new Date().toISOString(),
      })

      if (error) {
        setError(error.message)
        setBusy(false)
        return
      }

      setHint('Guardado.')
      setBusy(false)
    } catch {
      setError('JSON inválido.')
      setBusy(false)
    }
  }

  const resetDefault = () => {
    setJsonText(JSON.stringify(defaultViews[viewKey], null, 2))
    setHint('Restaurado a valores por defecto (aún no guardado).')
    setError(null)
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-zinc-500">
        <Link className="hover:underline" to="/admin">
          Admin
        </Link>{' '}
        / Vistas
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Constructor de vistas</h1>
        <div className="mt-2 text-sm text-zinc-600">
          Define qué campos se ven y cuáles son obligatorios sin tocar el código base.
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="block">
            <div className="text-xs font-medium text-zinc-700">Entidad</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
              value={entity}
              onChange={(e) => setEntity(e.target.value as Entity)}
              disabled={busy}
            >
              <option value="tickets">Tickets</option>
              <option value="expenses">Gastos</option>
            </select>
          </label>

          <label className="block">
            <div className="text-xs font-medium text-zinc-700">Tipo de vista</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
              value={viewType}
              onChange={(e) => setViewType(e.target.value as ViewType)}
              disabled={busy}
            >
              <option value="list">Listado</option>
              <option value="form">Formulario</option>
            </select>
          </label>

          <div className="md:col-span-2 flex items-end justify-end gap-2">
            <Button type="button" variant="ghost" onClick={resetDefault} disabled={busy || loading}>
              Restaurar
            </Button>
            <Button type="button" onClick={save} disabled={busy || loading}>
              {busy ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>

        {error ? <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {hint ? <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{hint}</div> : null}

        <div className="mt-4">
          <div className="text-xs font-medium text-zinc-700">Layout (JSON)</div>
          <textarea
            className="mt-1 h-80 w-full rounded-xl border border-zinc-200 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-300"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
            disabled={busy || loading}
          />
        </div>
      </div>
    </div>
  )
}

