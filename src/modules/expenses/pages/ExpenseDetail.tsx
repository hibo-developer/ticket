import { Button } from '@/components/ui/Button'
import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { Permission } from '@/core/rbac/permissions'
import { usePermissions } from '@/core/rbac/usePermissions'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

type Expense = {
  id: string
  state: string
  expense_date: string | null
  total_amount: number | null
  currency: string | null
  category: string | null
}

type TicketPick = { id: string; title: string }

export default function ExpenseDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const { permissions } = usePermissions()

  const [expense, setExpense] = useState<Expense | null>(null)
  const [linkedTickets, setLinkedTickets] = useState<TicketPick[]>([])
  const [availableTickets, setAvailableTickets] = useState<TicketPick[]>([])
  const [pick, setPick] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canWrite = permissions.has(Permission.ExpensesWrite)

  const load = async () => {
    if (!id || !profile?.org_id) {
      setExpense(null)
      setLinkedTickets([])
      setAvailableTickets([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [eRes, linkRes, ticketsRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, state, expense_date, total_amount, currency, category')
        .eq('id', id)
        .eq('org_id', profile.org_id)
        .single(),
      supabase
        .from('expense_tickets')
        .select('ticket_id, tickets!inner(id, title)')
        .eq('org_id', profile.org_id)
        .eq('expense_id', id),
      supabase.from('tickets').select('id, title').eq('org_id', profile.org_id).order('created_at', { ascending: false }).limit(100),
    ])

    if (eRes.error) {
      setError(eRes.error.message)
      setExpense(null)
      setLoading(false)
      return
    }

    const links = (linkRes.data ?? []) as any[]
    const linked = links.map((l) => ({ id: l.tickets.id as string, title: l.tickets.title as string }))
    const allTickets = (ticketsRes.data ?? []) as TicketPick[]

    setExpense(eRes.data as Expense)
    setLinkedTickets(linked)
    setAvailableTickets(allTickets)
    setPick('')
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [id, profile?.org_id])

  const subtitle = useMemo(() => {
    if (!expense) return ''
    const parts = []
    if (expense.category) parts.push(expense.category)
    if (expense.total_amount != null) parts.push(`${expense.total_amount.toFixed(2)} ${expense.currency ?? ''}`.trim())
    if (expense.expense_date) parts.push(expense.expense_date)
    return parts.join(' · ')
  }, [expense])

  const linkTicket = async () => {
    if (!id || !pick) return
    if (!canWrite) return
    if (!profile?.org_id) return
    setBusy(true)
    setError(null)

    const { error } = await supabase.from('expense_tickets').insert({ org_id: profile.org_id, expense_id: id, ticket_id: pick })
    setBusy(false)

    if (error) {
      setError(error.message)
      return
    }

    await load()
  }

  const unlinkTicket = async (ticketId: string) => {
    if (!id) return
    if (!canWrite) return
    if (!profile?.org_id) return
    setBusy(true)
    setError(null)

    const { error } = await supabase
      .from('expense_tickets')
      .delete()
      .eq('org_id', profile.org_id)
      .eq('expense_id', id)
      .eq('ticket_id', ticketId)
    setBusy(false)

    if (error) {
      setError(error.message)
      return
    }

    await load()
  }

  if (loading) {
    return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">Cargando…</div>
  }

  if (!expense) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-zinc-900">No encontrado</div>
          <div className="mt-2 text-sm text-zinc-600">No se puede acceder a este gasto.</div>
          <div className="mt-4">
            <Link className="text-sm text-zinc-900 underline underline-offset-4" to="/gastos">
              Volver a gastos
            </Link>
          </div>
        </div>
        {error ? <div className="text-sm text-rose-600">{error}</div> : null}
      </div>
    )
  }

  const linkedIds = new Set(linkedTickets.map((t) => t.id))
  const options = availableTickets.filter((t) => !linkedIds.has(t.id))

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-zinc-500">
          <Link className="hover:underline" to="/gastos">
            Gastos
          </Link>{' '}
          / {expense.id.slice(0, 8)}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Gasto</h1>
        {subtitle ? <div className="mt-1 text-sm text-zinc-600">{subtitle}</div> : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-zinc-900">Tickets vinculados</div>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
          <select
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-300 md:max-w-md"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            disabled={!canWrite || busy}
          >
            <option value="">Selecciona un ticket…</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <Button type="button" onClick={linkTicket} disabled={!canWrite || busy || !pick}>
            Vincular
          </Button>
        </div>

        {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}

        <div className="mt-4 space-y-2">
          {linkedTickets.length === 0 ? (
            <div className="text-sm text-zinc-500">No hay tickets vinculados.</div>
          ) : (
            linkedTickets.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2"
              >
                <Link className="text-sm font-medium text-zinc-900 hover:underline" to={`/tickets/${t.id}`}>
                  {t.title}
                </Link>
                <Button type="button" variant="ghost" size="sm" onClick={() => unlinkTicket(t.id)} disabled={!canWrite || busy}>
                  Quitar
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

