import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { usePermissions } from '@/core/rbac/usePermissions'
import { Permission } from '@/core/rbac/permissions'
import { useViewLayout } from '@/core/views/useViewLayout'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type TicketRow = {
  id: string
  title: string
  status: string
  ticket_date: string | null
  amount: number | null
  currency: string | null
  vendor: string | null
}

export default function TicketsList() {
  const { profile, session } = useAuth()
  const { permissions } = usePermissions()
  const { layout: formLayout } = useViewLayout('tickets.form')
  const { layout: listLayout } = useViewLayout('tickets.list')

  const [form, setForm] = useState({ title: '', vendor: '', amount: '' })
  const [rows, setRows] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canWrite = permissions.has(Permission.TicketsWrite)

  const load = async () => {
    if (!profile?.org_id) {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('tickets')
      .select('id, title, status, ticket_date, amount, currency, vendor')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      setError(error.message)
      setRows([])
      setLoading(false)
      return
    }

    setError(null)
    setRows((data ?? []) as TicketRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [profile?.org_id])

  const createTicket = async () => {
    if (!profile?.org_id || !session?.user) return
    if (!form.title.trim()) return

    setCreating(true)
    setError(null)

    const parsedAmount = form.amount.trim() ? Number(form.amount) : null
    const { error } = await supabase.from('tickets').insert({
      org_id: profile.org_id,
      owner_user_id: session.user.id,
      title: form.title.trim(),
      vendor: form.vendor.trim() ? form.vendor.trim() : null,
      amount: parsedAmount !== null && Number.isFinite(parsedAmount) ? parsedAmount : null,
      currency: 'EUR',
      status: 'draft',
    })

    setCreating(false)

    if (error) {
      setError(error.message)
      return
    }

    setForm({ title: '', vendor: '', amount: '' })
    await load()
  }

  const visibleColumns = listLayout.fields.filter((f) => f.visible !== false)

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Tickets</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Tickets y recibos</h1>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-zinc-900">Crear ticket</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          {formLayout.fields
            .filter((f) => f.visible !== false)
            .map((f) => {
              if (f.key === 'title') {
                return (
                  <Input
                    key={f.key}
                    placeholder={f.label}
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    disabled={!canWrite}
                    required={f.required}
                  />
                )
              }
              if (f.key === 'vendor') {
                return (
                  <Input
                    key={f.key}
                    placeholder={f.label}
                    value={form.vendor}
                    onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value }))}
                    disabled={!canWrite}
                    required={f.required}
                  />
                )
              }
              if (f.key === 'amount') {
                return (
                  <Input
                    key={f.key}
                    placeholder={f.label}
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                    disabled={!canWrite}
                    required={f.required}
                  />
                )
              }
              return null
            })}
          <Button type="button" onClick={createTicket} disabled={!canWrite || creating || !form.title.trim()}>
            {creating ? 'Creando…' : 'Crear'}
          </Button>
        </div>
        {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4 text-sm font-medium text-zinc-900">Últimos tickets</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr className="[&>th]:px-5 [&>th]:py-3">
                {visibleColumns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td className="px-5 py-4 text-zinc-500" colSpan={visibleColumns.length}>
                    Cargando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-5 py-4 text-zinc-500" colSpan={visibleColumns.length}>
                    Sin tickets todavía.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    {visibleColumns.map((c) => {
                      if (c.key === 'title') {
                        return (
                          <td key={c.key} className="px-5 py-4">
                            <Link className="font-medium text-zinc-900 hover:underline" to={`/tickets/${r.id}`}>
                              {r.title}
                            </Link>
                          </td>
                        )
                      }
                      if (c.key === 'vendor') {
                        return (
                          <td key={c.key} className="px-5 py-4 text-zinc-700">
                            {r.vendor ?? '—'}
                          </td>
                        )
                      }
                      if (c.key === 'amount') {
                        return (
                          <td key={c.key} className="px-5 py-4 text-zinc-700">
                            {r.amount != null ? `${r.amount.toFixed(2)} ${r.currency ?? ''}` : '—'}
                          </td>
                        )
                      }
                      if (c.key === 'status') {
                        return (
                          <td key={c.key} className="px-5 py-4">
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700">
                              {r.status}
                            </span>
                          </td>
                        )
                      }
                      return (
                        <td key={c.key} className="px-5 py-4 text-zinc-700">
                          —
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

