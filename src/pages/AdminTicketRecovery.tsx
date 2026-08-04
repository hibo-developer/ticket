import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/core/auth/AuthContext'
import { Permission } from '@/core/rbac/permissions'
import { usePermissions } from '@/core/rbac/usePermissions'
import { listTickets, recreateFailedTicket, softDeleteTicket, updateTicket } from '@/core/tickets/ticketsCrud'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type TicketRow = {
  id: string
  title: string
  vendor: string | null
  status: string
  created_at: string
  error_code: string | null
  error_message: string | null
  recreated_from_ticket_id: string | null
  deleted_at: string | null
}

export default function AdminTicketRecovery() {
  const { profile } = useAuth()
  const { permissions } = usePermissions()

  const canAdmin = permissions.has(Permission.AdminAccess)

  const [rows, setRows] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [filters, setFilters] = useState({
    status: '',
    error_code: '',
    created_from: '',
    created_to: '',
    ticket_id: '',
    include_deleted: false,
  })

  const load = async () => {
    if (!profile?.org_id || !canAdmin) return
    setLoading(true)
    setError(null)

    try {
      const data = await listTickets({
        status: filters.status.trim() || undefined,
        error_code: filters.error_code.trim() || undefined,
        created_from: filters.created_from || undefined,
        created_to: filters.created_to || undefined,
        ticket_id: filters.ticket_id.trim() || undefined,
        include_deleted: filters.include_deleted,
        limit: 200,
      })
      setRows(data as TicketRow[])
    } catch (e: any) {
      setRows([])
      setError(e?.message ?? 'Error al cargar tickets.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [profile?.org_id, canAdmin])

  const failedCount = useMemo(() => rows.filter((r) => Boolean(r.error_code) || r.status === 'error').length, [rows])

  const updateStatus = async (id: string, status: string) => {
    if (!profile?.org_id) return
    setBusyId(id)
    setError(null)
    try {
      await updateTicket({ org_id: profile.org_id, ticket_id: id, patch: { status } })
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo actualizar el ticket.')
    } finally {
      setBusyId(null)
    }
  }

  const recreate = async (id: string) => {
    if (!profile?.org_id) return
    setBusyId(id)
    setError(null)
    try {
      const newId = await recreateFailedTicket({ org_id: profile.org_id, ticket_id: id })
      await load()
      window.location.href = `/tickets/${newId}`
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo recrear el ticket.')
    } finally {
      setBusyId(null)
    }
  }

  const del = async (id: string) => {
    if (!profile?.org_id) return
    if (!window.confirm('¿Eliminar el ticket? Se marcará como eliminado (soft delete).')) return

    setBusyId(id)
    setError(null)
    try {
      await softDeleteTicket({ org_id: profile.org_id, ticket_id: id, reason: 'admin_recovery' })
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo eliminar el ticket.')
    } finally {
      setBusyId(null)
    }
  }

  if (!canAdmin) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-zinc-900">Acceso restringido</div>
        <div className="mt-2 text-sm text-zinc-600">No tienes permisos para acceder a Admin.</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-zinc-500">Administración</div>
        <div className="mt-1 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Recuperación de tickets</h1>
          <div className="text-sm text-zinc-600">
            {loading ? 'Cargando…' : `${rows.length} tickets · ${failedCount} con error`}
          </div>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <Input placeholder="Ticket ID" value={filters.ticket_id} onChange={(e) => setFilters((p) => ({ ...p, ticket_id: e.target.value }))} />
          <Input placeholder="Status" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))} />
          <Input placeholder="Error code" value={filters.error_code} onChange={(e) => setFilters((p) => ({ ...p, error_code: e.target.value }))} />
          <Input type="date" value={filters.created_from} onChange={(e) => setFilters((p) => ({ ...p, created_from: e.target.value }))} />
          <Input type="date" value={filters.created_to} onChange={(e) => setFilters((p) => ({ ...p, created_to: e.target.value }))} />
          <div className="flex gap-2">
            <Button type="button" className="w-full" onClick={load} disabled={loading}>
              Aplicar
            </Button>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={filters.include_deleted}
            onChange={(e) => setFilters((p) => ({ ...p, include_deleted: e.target.checked }))}
          />
          Incluir eliminados
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr className="[&>th]:px-5 [&>th]:py-3">
              <th>ID</th>
              <th>Título</th>
              <th>Status</th>
              <th>Error</th>
              <th>Recreado desde</th>
              <th>Creado</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td className="px-5 py-4 text-zinc-500" colSpan={7}>
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-5 py-4 text-zinc-500" colSpan={7}>
                  Sin resultados.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const shortId = r.id.slice(0, 8)
                const shortFrom = r.recreated_from_ticket_id ? r.recreated_from_ticket_id.slice(0, 8) : '—'
                const isBusy = busyId === r.id
                return (
                  <tr key={r.id} className={r.deleted_at ? 'bg-zinc-50' : undefined}>
                    <td className="px-5 py-4 font-mono text-xs text-zinc-600">{shortId}</td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-zinc-900">{r.title}</div>
                      <div className="text-xs text-zinc-500">{r.vendor ?? '—'}</div>
                    </td>
                    <td className="px-5 py-4 text-zinc-700">{r.status}</td>
                    <td className="px-5 py-4">
                      <div className="text-zinc-700">{r.error_code ?? '—'}</div>
                      <div className="text-xs text-zinc-500">{r.error_message ?? ''}</div>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-zinc-600">{shortFrom}</td>
                    <td className="px-5 py-4 text-zinc-700">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <Link className="text-xs text-zinc-900 underline underline-offset-4" to={`/tickets/${r.id}`}>
                          Abrir
                        </Link>
                        <button
                          className="text-xs text-zinc-900 underline underline-offset-4 disabled:opacity-60"
                          disabled={isBusy || Boolean(r.deleted_at)}
                          onClick={() => recreate(r.id)}
                        >
                          Recrear
                        </button>
                        <button
                          className="text-xs text-zinc-900 underline underline-offset-4 disabled:opacity-60"
                          disabled={isBusy || Boolean(r.deleted_at)}
                          onClick={() => updateStatus(r.id, 'error')}
                        >
                          Marcar error
                        </button>
                        <button
                          className="text-xs text-rose-700 underline underline-offset-4 disabled:opacity-60"
                          disabled={isBusy || Boolean(r.deleted_at)}
                          onClick={() => del(r.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

