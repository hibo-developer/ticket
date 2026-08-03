
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/core/auth/AuthContext'
import { supabase } from '@/core/auth/supabaseClient'
import { allModules } from '@/core/modules/registry'
import { AllPermissions, Permission, type PermissionKey } from '@/core/rbac/permissions'
import { usePermissions } from '@/core/rbac/usePermissions'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type ToggleRow = { module_id: string; enabled: boolean }
type AuditRow = { id: string; action: string; resource_type: string; created_at: string }
type RoleRow = { id: string; name: string; description: string | null }

export default function Admin() {
  const { profile } = useAuth()
  const { permissions } = usePermissions()

  const [toggles, setToggles] = useState<Record<string, boolean>>({})
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canAdmin = permissions.has(Permission.AdminAccess)

  const load = async () => {
    if (!profile?.org_id || !canAdmin) return
    setLoading(true)
    setError(null)

    const [tRes, aRes, rRes] = await Promise.all([
      supabase.from('module_toggles').select('module_id, enabled').eq('org_id', profile.org_id),
      supabase
        .from('audit_log')
        .select('id, action, resource_type, created_at')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('roles').select('id, name, description').eq('org_id', profile.org_id).order('name', { ascending: true }),
    ])

    if (tRes.error || aRes.error || rRes.error) {
      setError((tRes.error ?? aRes.error ?? rRes.error)?.message ?? 'Error al cargar Admin.')
      setLoading(false)
      return
    }

    const next: Record<string, boolean> = {}
    for (const m of allModules) next[m.id] = true
    for (const row of (tRes.data ?? []) as ToggleRow[]) next[row.module_id] = row.enabled

    setToggles(next)
    setAudit((aRes.data ?? []) as AuditRow[])
    setRoles((rRes.data ?? []) as RoleRow[])
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
          <div className="flex gap-2">
            <Link
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm leading-9 text-zinc-900 hover:bg-zinc-100"
              to="/admin/vistas"
            >
              Vistas
            </Link>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

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

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-medium text-zinc-900">Auditoría reciente</div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr className="[&>th]:px-3 [&>th]:py-2">
                <th>Fecha</th>
                <th>Acción</th>
                <th>Recurso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {audit.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-500" colSpan={3}>
                    Sin eventos.
                  </td>
                </tr>
              ) : (
                audit.map((a) => (
                  <tr key={a.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-3 text-zinc-600">{new Date(a.created_at).toLocaleString()}</td>
                    <td className="px-3 py-3 font-medium text-zinc-900">{a.action}</td>
                    <td className="px-3 py-3 text-zinc-600">{a.resource_type}</td>
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

