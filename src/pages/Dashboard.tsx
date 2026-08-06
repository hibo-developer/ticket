import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { useEffect, useMemo, useState } from 'react'

type Metric = { label: string; value: string }

export default function Dashboard() {
  const { profile } = useAuth()
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!profile?.org_id) {
        setMetrics([])
        setLoading(false)
        return
      }

      setLoading(true)

      const [expensesCount, expensesSum] = await Promise.all([
        supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('org_id', profile.org_id),
        supabase.from('expenses').select('total_amount').eq('org_id', profile.org_id),
      ])

      if (cancelled) return

      const sum = (expensesSum.data ?? []).reduce((acc: number, r: any) => acc + (Number(r.total_amount) || 0), 0)

      setMetrics([
        { label: 'Gastos registrados', value: String(expensesCount.count ?? 0) },
        { label: 'Total importe gastos', value: `${sum.toFixed(2)} EUR` },
      ])
      setLoading(false)
    }

    run()

    return () => {
      cancelled = true
    }
  }, [profile?.org_id])

  const title = useMemo(() => {
    if (!profile) return 'Dashboard'
    return profile.full_name ? `Hola, ${profile.full_name}` : 'Dashboard'
  }, [profile])

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-zinc-500">Gastos Cotepa</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(loading ? [0, 1] : metrics).map((m: any, idx: number) => (
          <div
            key={idx}
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
          >
            {loading ? (
              <div className="space-y-3">
                <div className="h-4 w-24 animate-pulse rounded bg-zinc-100" />
                <div className="h-7 w-16 animate-pulse rounded bg-zinc-100" />
              </div>
            ) : (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{m.label}</div>
                <div className="mt-2 text-3xl font-semibold text-zinc-900">{m.value}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-zinc-900">Siguiente paso</div>
        <div className="mt-2 text-sm text-zinc-600">
          Configura módulos, roles y vistas desde Admin. Después, empieza a registrar gastos y adjuntar la foto del ticket de caja.
        </div>
      </div>
    </div>
  )
}
