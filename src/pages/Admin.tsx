import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { appendAudit } from '@/core/audit/audit'
import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { allModules } from '@/core/modules/registry'
import { AllPermissions, Permission, type PermissionKey } from '@/core/rbac/permissions'
import { usePermissions } from '@/core/rbac/usePermissions'
import { signDownloadUrl } from '@/core/storage/signedUrls'
import { getCategoryLabel } from '@/modules/expenses/pages/ExpensesList'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type ToggleRow = { module_id: string; enabled: boolean }
type RoleRow = { id: string; name: string; description: string | null }

type ExpenseRow = {
  id: string
  state: string
  expense_date: string | null
  total_amount: number | null
  currency: string | null
  category: string | null
  vehicle_plate: string | null
  created_at: string
  files: ExpenseFileRow[]
}

type ExpenseFileRow = {
  id: string
  expense_id: string
  filename: string
  mimetype: string | null
  byte_size: number | null
  storage_bucket: string
  storage_path: string
  sha256: string
  created_at: string
}

export default function Admin() {
  const { profile } = useAuth()
  const { permissions } = usePermissions()

  const [toggles, setToggles] = useState<Record<string, boolean>>({})
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [receiptFilter, setReceiptFilter] = useState<'all' | 'with_receipt' | 'no_receipt'>('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [busyDownload, setBusyDownload] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const canAdmin = permissions.has(Permission.AdminAccess)
  const canReadExpenses = permissions.has(Permission.ExpensesRead)

  const load = async () => {
    if (!profile?.org_id || !canAdmin) return
    setLoading(true)
    setError(null)

    const [tRes, rRes, eRes, fRes] = await Promise.all([
      supabase.from('module_toggles').select('module_id, enabled').eq('org_id', profile.org_id),
      supabase.from('roles').select('id, name, description').eq('org_id', profile.org_id).order('name', { ascending: true }),
      supabase
        .from('expenses')
        .select('id, state, expense_date, total_amount, currency, category, vehicle_plate, created_at')
        .eq('org_id', profile.org_id)
        .order('expense_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('expense_files')
        .select('id, expense_id, filename, mimetype, byte_size, storage_bucket, storage_path, sha256, created_at')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false }),
    ])

    if (tRes.error || rRes.error || eRes.error || fRes.error) {
      setError(
        (tRes.error ?? rRes.error ?? eRes.error ?? fRes.error)?.message ?? 'Error al cargar Admin.',
      )
      setLoading(false)
      return
    }

    const next: Record<string, boolean> = {}
    for (const m of allModules) next[m.id] = true
    for (const row of (tRes.data ?? []) as ToggleRow[]) next[row.module_id] = row.enabled

    const filesByExp = new Map<string, ExpenseFileRow[]>()
    for (const f of (fRes.data ?? []) as ExpenseFileRow[]) {
      const prev = filesByExp.get(f.expense_id) ?? []
      prev.push(f)
      filesByExp.set(f.expense_id, prev)
    }
    const withFiles: ExpenseRow[] = ((eRes.data ?? []) as ExpenseRow[]).map((e) => ({
      ...e,
      files: filesByExp.get(e.id) ?? [],
    }))

    setToggles(next)
    setRoles((rRes.data ?? []) as RoleRow[])
    setExpenses(withFiles)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [profile?.org_id, canAdmin])

  const setModuleEnabled = async (moduleId: string, enabled: boolean) => {
    if (!profile?.org_id) return
    setBusy(true)
    setError(null)

    const { error } = await supabase.from('module_toggles').upsert({
      org_id: profile.org_id,
      module_id: moduleId,
      enabled,
      updated_at: new Date().toISOString(),
    })

    setBusy(false)

    if (error) {
      setError(error.message)
      return
    }

    setToggles((prev) => ({ ...prev, [moduleId]: enabled }))
  }

  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')

  const createRole = async () => {
    if (!profile?.org_id) return
    const name = newRoleName.trim()
    if (!name) return

    setBusy(true)
    setError(null)

    const { error } = await supabase.from('roles').insert({
      org_id: profile.org_id,
      name,
      description: newRoleDesc.trim() || null,
    })

    setBusy(false)

    if (error) {
      setError(error.message)
      return
    }

    setNewRoleName('')
    setNewRoleDesc('')
    await load()
  }

  const [selectedRole, setSelectedRole] = useState<string>('')
  const selected = useMemo(() => roles.find((r) => r.id === selectedRole) ?? null, [roles, selectedRole])

  const [rolePerms, setRolePerms] = useState<Set<PermissionKey>>(new Set())

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!profile?.org_id || !selectedRole) {
        setRolePerms(new Set())
        return
      }

      const { data, error } = await supabase.from('role_permissions').select('permission_key').eq('role_id', selectedRole)
      if (cancelled) return
      if (error) {
        setRolePerms(new Set())
        return
      }
      setRolePerms(new Set((data ?? []).map((r: any) => r.permission_key as PermissionKey)))
    }

    run()

    return () => {
      cancelled = true
    }
  }, [selectedRole, profile?.org_id])

  const toggleRolePermission = async (permission: PermissionKey) => {
    if (!selectedRole) return
    setBusy(true)
    setError(null)

    const has = rolePerms.has(permission)

    const res = has
      ? await supabase.from('role_permissions').delete().eq('role_id', selectedRole).eq('permission_key', permission)
      : await supabase.from('role_permissions').insert({ role_id: selectedRole, permission_key: permission })

    setBusy(false)

    if (res.error) {
      setError(res.error.message)
      return
    }

    setRolePerms((prev) => {
      const next = new Set(prev)
      if (has) next.delete(permission)
      else next.add(permission)
      return next
    })
  }

  const downloadReceipt = async (e: ExpenseRow, f: ExpenseFileRow) => {
    if (!canReadExpenses || !profile?.org_id) return
    setBusyDownload(f.id)
    setError(null)
    try {
      const { signed_url } = await signDownloadUrl({
        bucket: f.storage_bucket,
        path: f.storage_path,
        resource_type: 'expense_file',
        resource_id: f.id,
      })

      await appendAudit({
        org_id: profile.org_id,
        action: 'EXPENSE_RECEIPT_DOWNLOAD',
        resource_type: 'expense',
        resource_id: e.id,
        metadata: { filename: f.filename, sha256: f.sha256 },
      })

      const a = document.createElement('a')
      a.href = signed_url
      a.download = f.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setSuccess(`Descargado: ${f.filename}`)
    } catch (err: any) {
      setError(err?.message ?? 'Error al generar la descarga.')
    } finally {
      setBusyDownload(null)
    }
  }

  const downloadAllForExpense = async (e: ExpenseRow) => {
    if (!canReadExpenses) return
    let ok = 0
    let failed = 0
    for (const f of e.files) {
      try {
        await downloadReceipt(e, f)
        ok += 1
      } catch {
        failed += 1
      }
    }
    if (failed === 0) setSuccess(`Descargados ${ok} adjuntos para el gasto.`)
    else setSuccess(`Descargados ${ok} adjuntos (${failed} fallidos).`)
  }

  const filtered = useMemo(() => {
    if (receiptFilter === 'with_receipt') return expenses.filter((e) => e.files.length > 0)
    if (receiptFilter === 'no_receipt') return expenses.filter((e) => e.files.length === 0)
    return expenses
  }, [expenses, receiptFilter])

  if (!canAdmin) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-zinc-900">Acceso restringido</div>
        <div className="mt-2 text-sm text-zinc-600">No tienes permisos para acceder a Admin.</div>
      </div>
    )
  }

  if (loading) {
    return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">Cargando…</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-zinc-500">Administración</div>
        <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Admin</h1>
          <div className="flex flex-wrap gap-2">
            <Link
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm leading-9 text-zinc-900 hover:bg-zinc-100"
              to="/admin/usuarios"
            >
              Usuarios
            </Link>
            <Link
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm leading-9 text-zinc-900 hover:bg-zinc-100"
              to="/admin/vistas"
            >
              Vistas
            </Link>
            <a
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm leading-9 text-zinc-900 hover:bg-zinc-100"
              href="#cotejo"
            >
              Cotejo de tickets
            </a>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-zinc-900">Módulos</div>
          <div className="mt-2 text-sm text-zinc-600">Activa o desactiva módulos sin recompilar.</div>
          <div className="mt-4 space-y-2">
            {allModules.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-zinc-900">{m.name}</div>
                  <div className="text-xs text-zinc-500">{m.id}</div>
                </div>
                <button
                  className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 hover:bg-zinc-100 disabled:opacity-60"
                  disabled={busy}
                  onClick={() => setModuleEnabled(m.id, !toggles[m.id])}
                >
                  {toggles[m.id] ? 'Habilitado' : 'Deshabilitado'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-zinc-900">Roles y permisos</div>
          <div className="mt-2 text-sm text-zinc-600">Define roles y asigna permisos granulares.</div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input placeholder="Nombre rol" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
            <Input placeholder="Descripción" value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} />
            <Button type="button" onClick={createRole} disabled={busy || !newRoleName.trim()}>
              Crear rol
            </Button>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <select
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-300 md:max-w-xs"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              <option value="">Selecciona un rol…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {selected ? <div className="text-sm text-zinc-600 md:self-center">{selected.description ?? ''}</div> : null}
          </div>

          {selectedRole ? (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AllPermissions.map((p) => (
                <button
                  key={p}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-60"
                  disabled={busy}
                  onClick={() => toggleRolePermission(p)}
                >
                  <span className="font-mono text-xs text-zinc-700">{p}</span>
                  <span className="text-xs text-zinc-500">{rolePerms.has(p) ? 'ON' : 'OFF'}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div id="cotejo" className="scroll-mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-900">Cotejo de tickets</div>
            <div className="mt-1 text-sm text-zinc-600">
              Lista de gastos con sus tickets de caja para descargar y cotejar.
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Filtro</div>
            <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 text-sm">
              {(['all', 'with_receipt', 'no_receipt'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setReceiptFilter(v)}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    receiptFilter === v ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  {v === 'all' ? 'Todos' : v === 'with_receipt' ? 'Con adjunto' : 'Sin adjunto'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr className="[&>th]:px-3 [&>th]:py-2">
                <th>Gasto</th>
                <th>Fecha</th>
                <th>Importe</th>
                <th>Matrícula</th>
                <th>Estado</th>
                <th>Adjuntos</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-500" colSpan={7}>
                    No hay gastos en este filtro.
                  </td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id} className="align-top hover:bg-zinc-50">
                    <td className="px-3 py-3">
                      <div className="font-medium text-zinc-900">{getCategoryLabel(e.category)}</div>
                      <div className="font-mono text-xs text-zinc-500">{e.id.slice(0, 8)}…</div>
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{e.expense_date ?? '—'}</td>
                    <td className="px-3 py-3 text-zinc-900">
                      {e.total_amount != null ? `${e.total_amount.toFixed(2)} ${e.currency ?? ''}` : '—'}
                    </td>
                    <td className="px-3 py-3 font-mono text-zinc-900">{e.vehicle_plate ?? '—'}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700">
                        {e.state}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {e.files.length === 0 ? (
                        <span className="text-sm text-zinc-500">Sin adjuntos</span>
                      ) : (
                        <div className="space-y-1">
                          {e.files.map((f) => (
                            <div key={f.id} className="flex items-center gap-2 text-xs">
                              <span className="truncate text-zinc-900">{f.filename}</span>
                              <span className="text-zinc-500">
                                {f.byte_size != null ? `${Math.max(1, Math.round(f.byte_size / 1024))} KB` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {e.files.length > 0 ? (
                        <div className="flex flex-col items-end gap-1">
                          {e.files.map((f) => (
                            <Button
                              key={f.id}
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => downloadReceipt(e, f)}
                              disabled={busy || busyDownload != null || !canReadExpenses}
                            >
                              {busyDownload === f.id ? 'Descargando…' : 'Descargar'}
                            </Button>
                          ))}
                          {e.files.length > 1 ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => downloadAllForExpense(e)}
                              disabled={busy || busyDownload != null || !canReadExpenses}
                            >
                              Descargar todos
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <Link
                          className="inline-flex h-9 items-center rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 hover:bg-zinc-100"
                          to={`/gastos/${e.id}`}
                        >
                          Gestionar
                        </Link>
                      )}
                    </td>
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
