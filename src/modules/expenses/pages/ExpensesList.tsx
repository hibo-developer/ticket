import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { Permission } from '@/core/rbac/permissions'
import { usePermissions } from '@/core/rbac/usePermissions'
import { useViewLayout } from '@/core/views/useViewLayout'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type ExpenseRow = {
  id: string
  state: string
  expense_date: string | null
  total_amount: number | null
  currency: string | null
  category: string | null
}

export default function ExpensesList() {
  const { profile, session } = useAuth()
  const { permissions } = usePermissions()
  const { layout: formLayout } = useViewLayout('expenses.form')
  const { layout: listLayout } = useViewLayout('expenses.list')

  const [form, setForm] = useState({ category: '', total_amount: '' })
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canWrite = permissions.has(Permission.ExpensesWrite)

  const load = async () => {
    if (!profile?.org_id) {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('expenses')
      .select('id, state, expense_date, total_amount, currency, category')
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
    setRows((data ?? []) as ExpenseRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [profile?.org_id])

  const createExpense = async () => {
    if (!profile?.org_id || !session?.user) return
    const parsed = form.total_amount.trim() ? Number(form.total_amount) : null
    if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) {
      setError('Introduce un importe válido.')
      return
    }

    setCreating(true)
    setError(null)

    const { error } = await supabase.from('expenses').insert({
      org_id: profile.org_id,
      employee_user_id: session.user.id,
      state: 'draft',
      expense_date: new Date().toISOString().slice(0, 10),
      total_amount: parsed,
      currency: 'EUR',
      category: form.category.trim() ? form.category.trim() : null,
    })

    setCreating(false)

    if (error) {
      setError(error.message)
      return
    }

    setForm({ category: '', total_amount: '' })
    await load()
  }

  const visibleColumns = listLayout.fields.filter((f) => f.visible !== false)

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-zinc-500">Gastos</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Gastos</h1>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-zinc-900">Crear gasto</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {formLayout.fields
            .filter((f) => f.visible !== false)
            .map((f) => {
              if (f.key === 'category') {
                return (
                  <Input
                    key={f.key}
                    placeholder={f.label}
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    disabled={!canWrite}
                    required={f.required}
                  />
                )
              }
              if (f.key === 'total_amount') {
                return (
                  <Input
                    key={f.key}
                    placeholder={f.label}
                    inputMode="decimal"
                    value={form.total_amount}
                    onChange={(e) => setForm((p) => ({ ...p, total_amount: e.target.value }))}
                    disabled={!canWrite}
                    required={f.required}
                  />
                )
              }
              return null
            })}
          <Button type="button" onClick={createExpense} disabled={!canWrite || creating}>
            {creating ? 'Creando…' : 'Crear'}
          </Button>
        </div>
        {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4 text-sm font-medium text-zinc-900">Últimos gastos</div>
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
                    Sin gastos todavía.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    {visibleColumns.map((c) => {
                      if (c.key === 'expense_date') {
                        return (
                          <td key={c.key} className="px-5 py-4 text-zinc-700">
                            {r.expense_date ?? '—'}
                          </td>
                        )
                      }
                      if (c.key === 'category') {
                        return (
                          <td key={c.key} className="px-5 py-4">
                            <Link className="font-medium text-zinc-900 hover:underline" to={`/gastos/${r.id}`}>
                              {r.category ?? 'Sin categoría'}
                            </Link>
                          </td>
                        )
                      }
                      if (c.key === 'total_amount') {
                        return (
                          <td key={c.key} className="px-5 py-4 text-zinc-700">
                            {r.total_amount != null ? `${r.total_amount.toFixed(2)} ${r.currency ?? ''}` : '—'}
                          </td>
                        )
                      }
                      if (c.key === 'state') {
                        return (
                          <td key={c.key} className="px-5 py-4">
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700">
                              {r.state}
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
