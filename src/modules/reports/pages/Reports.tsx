import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { useEffect, useState } from 'react'

type Card = { label: string; value: string }

export default function Reports() {
  const { profile } = useAuth()
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!profile?.org_id) {
        setCards([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      const [ticketsCount, draftTickets, expensesSum] = await Promise.all([
        supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('org_id', profile.org_id),
        supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('org_id', profile.org_id).eq('status', 'draft'),
        supabase.from('expenses').select('total_amount').eq('org_id', profile.org_id),
      ])

      if (cancelled) return

      if (ticketsCount.error || draftTickets.error || expensesSum.error) {
        setError('No se pudieron cargar los datos del informe.')
        setCards([])
        setLoading(false)
        return
      }

      const sum = (expensesSum.data ?? []).reduce((acc: number, r: any) => acc + (Number(r.total_amount) || 0), 0)

      setCards([
        { label: 'Tickets totales', value: String(ticketsCount.count ?? 0) },
        { label: 'Tickets en borrador', value: String(draftTickets.count ?? 0) },
        { label: 'Total gastos', value: `${sum.toFixed(2)} EUR` },
      ])
      setLoading(false)
    }

    run()

    return () => {
      cancelled = true
    }
  }, [profile?.org_id])

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-zinc-500">Informes</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Informes</h1>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {(loading ? [0, 1, 2] : cards).map((c: any, idx: number) => (
          <div key={idx} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            {loading ? (
              <div className="space-y-3">
                <div className="h-4 w-28 animate-pulse rounded bg-zinc-100" />
                <div className="h-7 w-20 animate-pulse rounded bg-zinc-100" />
              </div>
            ) : (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{c.label}</div>
                <div className="mt-2 text-3xl font-semibold text-zinc-900">{c.value}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-zinc-900">Exportaciones</div>
        <div className="mt-2 text-sm text-zinc-600">Las exportaciones avanzadas se habilitan en iteraciones posteriores (CSV por filtros y snapshot imprimible).</div>
      </div>
    </div>
  )
}

